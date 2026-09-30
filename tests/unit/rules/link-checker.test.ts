import type { LookupAddress } from "node:dns";
import { describe, expect, it, vi } from "vitest";
import {
  checkInternalLinks,
  extractLinkCandidates,
  isPublicIpAddress,
} from "@/lib/audit/link-checker";
import type { Product } from "@/lib/audit/types";

const publicAddresses: LookupAddress[] = [{ address: "93.184.216.34", family: 4 }];

describe("SSRF-safe same-store internal link checker", () => {
  it("extracts product links from descriptions", () => {
    const products = [
      { id: "p1", description: '<p><a href="/products/blue-shirt">Blue shirt</a></p>' },
      { id: "p2", description: '<a href="https://shop.example.test/products/hat">Hat</a>' },
      { id: "p3", description: '<a href="https://outside.example/products/other">Other</a>' },
    ] as Product[];
    expect(extractLinkCandidates(products, "https://shop.example.test")).toEqual([
      { productId: "p1", url: "https://shop.example.test/products/blue-shirt" },
      { productId: "p2", url: "https://shop.example.test/products/hat" },
    ]);
  });

  it("checks status codes and follows at most two same-domain redirects", async () => {
    const request = vi.fn(async (url: URL) => {
      if (url.pathname === "/products/redirect-1")
        return { status: 301, location: "/products/redirect-2" };
      if (url.pathname === "/products/redirect-2")
        return { status: 302, location: "/products/final" };
      return { status: 200, location: null };
    });
    const result = await checkInternalLinks(
      [
        { productId: "p1", url: "/products/redirect-1" },
        { productId: "p2", url: "/products/missing" },
      ],
      "https://shop.example.test",
      { dependencies: { resolveHost: async () => publicAddresses, request } },
    );
    expect(result[0]).toMatchObject({ broken: false, redirects: 2, status: 200 });
    expect(result[1]).toMatchObject({ broken: false, redirects: 0, status: 200 });
  });

  it("reports HTTP errors and excessive or cross-domain redirects", async () => {
    const request = vi.fn(async (url: URL) => {
      if (url.pathname === "/products/404") return { status: 404, location: null };
      if (url.pathname === "/products/away")
        return { status: 302, location: "http://127.0.0.1/admin" };
      return { status: 302, location: `/products/step-${url.pathname.at(-1)}` };
    });
    const result = await checkInternalLinks(
      [
        { productId: "p1", url: "/products/404" },
        { productId: "p2", url: "/products/away" },
        { productId: "p3", url: "/products/chain-1" },
      ],
      "https://shop.example.test",
      { dependencies: { resolveHost: async () => publicAddresses, request } },
    );
    expect(result[0]).toMatchObject({ broken: true, status: 404 });
    expect(result[1]).toMatchObject({ broken: true, redirects: 1 });
    expect(result[2]).toMatchObject({ broken: true, redirects: 3 });
  });

  it("treats redirects without a location and disallowed ports as broken", async () => {
    const request = vi.fn(async () => ({ status: 302, location: null }));
    const resolveHost = vi.fn(async () => publicAddresses);
    const result = await checkInternalLinks(
      [
        { productId: "p1", url: "/products/no-location" },
        { productId: "p2", url: "https://shop.example.test:8080/products/custom-port" },
      ],
      "https://shop.example.test",
      { dependencies: { resolveHost, request } },
    );
    expect(result[0]).toMatchObject({ broken: true, status: 302 });
    expect(result[1]).toMatchObject({ broken: true, status: null });
    expect(resolveHost).toHaveBeenCalledTimes(1);
    await expect(
      checkInternalLinks([], "https://shop.example.test", { concurrency: 0 }),
    ).rejects.toThrow(RangeError);
  });

  it("blocks private and reserved IPs before making a request", async () => {
    const request = vi.fn(async () => ({ status: 200, location: null }));
    const result = await checkInternalLinks(
      [{ productId: "p1", url: "/products/private" }],
      "https://shop.example.test",
      {
        dependencies: {
          resolveHost: async () => [{ address: "10.0.0.5", family: 4 }],
          request,
        },
      },
    );
    expect(result[0]).toMatchObject({ broken: true, status: null });
    expect(request).not.toHaveBeenCalled();
    expect(isPublicIpAddress("127.0.0.1")).toBe(false);
    expect(isPublicIpAddress("169.254.1.1")).toBe(false);
    expect(isPublicIpAddress("::1")).toBe(false);
    expect(isPublicIpAddress("::ffff:10.1.2.3")).toBe(false);
    expect(isPublicIpAddress("2001:db8::1")).toBe(false);
    expect(isPublicIpAddress("93.184.216.34")).toBe(true);
    expect(isPublicIpAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("keeps concurrent requests within the configured bound", async () => {
    let active = 0;
    let maximum = 0;
    const request = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { status: 204, location: null };
    });
    const results = await checkInternalLinks(
      Array.from({ length: 9 }, (_, index) => ({
        productId: `p${index}`,
        url: `/products/${index}`,
      })),
      "https://shop.example.test",
      { concurrency: 2, dependencies: { resolveHost: async () => publicAddresses, request } },
    );
    expect(results).toHaveLength(9);
    expect(maximum).toBe(2);
  });
});
