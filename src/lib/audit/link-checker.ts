import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupAddress } from "node:dns";
import type { Product } from "./types";

export type InternalLinkCandidate = { productId: string; url: string };
export type LinkCheckResult = {
  productId: string;
  url: string;
  broken: boolean;
  status: number | null;
  redirects: number;
  reason?: string;
};

export type LinkCheckerDependencies = {
  resolveHost: (hostname: string) => Promise<LookupAddress[]>;
  request: (
    url: URL,
    addresses: LookupAddress[],
    timeoutMs: number,
  ) => Promise<{ status: number; location: string | null }>;
};

export function extractLinkCandidates(
  products: Pick<Product, "id" | "description">[],
  storeOrigin: string,
): InternalLinkCandidate[] {
  const store = new URL(storeOrigin);
  const candidates: InternalLinkCandidate[] = [];
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const product of products) {
    for (const match of product.description.matchAll(hrefPattern)) {
      const href = (match[1] ?? match[2] ?? match[3] ?? "").trim();
      if (!href) continue;
      try {
        const url = new URL(href, store);
        if (
          url.hostname.toLowerCase() === store.hostname.toLowerCase() &&
          url.pathname.toLowerCase().startsWith("/products/")
        )
          candidates.push({ productId: product.id, url: url.toString() });
      } catch {
        candidates.push({ productId: product.id, url: href });
      }
    }
  }
  return candidates;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_MAX_REDIRECTS = 2;

export function isPublicIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 88 && octets[2] === 99) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && octets[2] === 100) ||
      (a === 203 && b === 0 && octets[2] === 113) ||
      a >= 224
    );
  }
  if (version !== 6) return false;
  const normalized = address.toLowerCase().split("%")[0];
  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff")
  )
    return false;
  if (
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2002:")
  )
    return false;
  const mappedV4 = normalized.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedV4) return isPublicIpAddress(mappedV4[1]);
  return true;
}

async function resolvePublicHost(hostname: string): Promise<LookupAddress[]> {
  if (isIP(hostname)) {
    const family = isIP(hostname);
    if (!isPublicIpAddress(hostname)) return [];
    return [{ address: hostname, family }];
  }
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  return addresses.every((entry) => isPublicIpAddress(entry.address)) ? addresses : [];
}

function requestPinned(
  url: URL,
  addresses: LookupAddress[],
  timeoutMs: number,
): Promise<{ status: number; location: string | null }> {
  const requestOnce = (method: "HEAD" | "GET") =>
    new Promise<{ status: number; location: string | null }>((resolve, reject) => {
      const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
      const lookup = (
        _hostname: string,
        options: { all?: boolean },
        callback: (
          error: NodeJS.ErrnoException | null,
          address: string | LookupAddress[],
          family?: number,
        ) => void,
      ) => {
        if (!addresses.length) {
          callback(new Error("No public address resolved"), "");
          return;
        }
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      };
      const request = requestFn(url, {
        method,
        headers: {
          "user-agent": "AI-Commerce-Copilot-Link-Audit/1.0",
          accept: "text/html,*/*;q=0.8",
          ...(method === "GET" ? { range: "bytes=0-0" } : {}),
        },
        lookup,
        timeout: timeoutMs,
      });
      request.once("timeout", () => request.destroy(new Error("Link check timed out")));
      request.once("error", reject);
      request.once("response", (response) => {
        const result = {
          status: response.statusCode ?? 0,
          location: response.headers.location ?? null,
        };
        response.destroy();
        resolve(result);
      });
      request.end();
    });
  return requestOnce("HEAD").then((result) =>
    result.status === 405 || result.status === 501 ? requestOnce("GET") : result,
  );
}

function isPermittedTarget(target: URL, store: URL): boolean {
  return (
    (target.protocol === "http:" || target.protocol === "https:") &&
    target.hostname.toLowerCase() === store.hostname.toLowerCase() &&
    !target.username &&
    !target.password &&
    (target.port === "" ||
      (target.protocol === "http:" && target.port === "80") ||
      (target.protocol === "https:" && target.port === "443"))
  );
}

async function checkOne(
  candidate: InternalLinkCandidate,
  store: URL,
  dependencies: LinkCheckerDependencies,
  timeoutMs: number,
  maxRedirects: number,
): Promise<LinkCheckResult> {
  let target: URL;
  try {
    target = new URL(candidate.url, store);
  } catch {
    return { ...candidate, broken: true, status: null, redirects: 0, reason: "Invalid URL" };
  }
  let redirects = 0;
  while (true) {
    if (!isPermittedTarget(target, store))
      return {
        ...candidate,
        broken: true,
        status: null,
        redirects,
        reason: "Target is outside the store domain allow-list",
      };
    let addresses: LookupAddress[];
    try {
      addresses = await dependencies.resolveHost(target.hostname);
    } catch {
      return { ...candidate, broken: true, status: null, redirects, reason: "DNS lookup failed" };
    }
    if (!addresses.length || addresses.some((entry) => !isPublicIpAddress(entry.address)))
      return {
        ...candidate,
        broken: true,
        status: null,
        redirects,
        reason: "Target resolves to a private or reserved address",
      };

    let response: { status: number; location: string | null };
    try {
      response = await dependencies.request(target, addresses, timeoutMs);
    } catch {
      return {
        ...candidate,
        broken: true,
        status: null,
        redirects,
        reason: "Connection failed or timed out",
      };
    }
    if (response.status >= 300 && response.status < 400) {
      if (!response.location)
        return {
          ...candidate,
          broken: true,
          status: response.status,
          redirects,
          reason: "Redirect response has no location",
        };
      if (redirects >= maxRedirects)
        return {
          ...candidate,
          broken: true,
          status: response.status,
          redirects: redirects + 1,
          reason: "Redirect chain exceeds the allowed limit",
        };
      let next: URL;
      try {
        next = new URL(response.location, target);
      } catch {
        return {
          ...candidate,
          broken: true,
          status: response.status,
          redirects,
          reason: "Invalid redirect target",
        };
      }
      if (!isPermittedTarget(next, store))
        return {
          ...candidate,
          broken: true,
          status: response.status,
          redirects: redirects + 1,
          reason: "Redirect leaves the store domain allow-list",
        };
      target = next;
      redirects += 1;
      continue;
    }
    return {
      ...candidate,
      broken: response.status >= 400 || response.status < 200,
      status: response.status,
      redirects,
      ...(response.status >= 400 || response.status < 200
        ? { reason: `HTTP ${response.status}` }
        : {}),
    };
  }
}

const defaultDependencies: LinkCheckerDependencies = {
  resolveHost: resolvePublicHost,
  request: requestPinned,
};

export async function checkInternalLinks(
  candidates: InternalLinkCandidate[],
  storeOrigin: string,
  options: {
    concurrency?: number;
    timeoutMs?: number;
    maxRedirects?: number;
    dependencies?: LinkCheckerDependencies;
  } = {},
): Promise<LinkCheckResult[]> {
  const store = new URL(storeOrigin);
  if (store.protocol !== "http:" && store.protocol !== "https:")
    throw new TypeError("Store origin must use HTTP or HTTPS");
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16)
    throw new RangeError("Link-check concurrency must be between 1 and 16");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > 10000)
    throw new RangeError("Link-check timeout must be between 250 and 10000 ms");
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5)
    throw new RangeError("Maximum redirects must be between 0 and 5");
  const dependencies = options.dependencies ?? defaultDependencies;
  const output: LinkCheckResult[] = new Array(candidates.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    while (nextIndex < candidates.length) {
      const index = nextIndex++;
      output[index] = await checkOne(
        candidates[index],
        store,
        dependencies,
        timeoutMs,
        maxRedirects,
      );
    }
  });
  await Promise.all(workers);
  return output;
}
