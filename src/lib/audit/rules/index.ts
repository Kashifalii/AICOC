import type { AuditIssue, Product, Severity } from "../types";
import { contentHash, normalizeText, wordCount } from "../text";
import { jaccardSimilarity } from "../duplicates";
import { productJsonLd, validateProductJsonLd } from "../jsonld";

export const RULE_IDS = [
  "SEO-001",
  "SEO-002",
  "SEO-003",
  "SEO-004",
  "SEO-005",
  "SEO-006",
  "IMG-001",
  "IMG-002",
  "CNT-001",
  "CNT-002",
  "CNT-003",
  "CNT-004",
  "DAT-001",
  "DAT-002",
  "DAT-003",
  "SCH-001",
  "SCH-002",
  "LNK-001",
  "LNK-002",
] as const;

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 10, high: 6, medium: 3, low: 1 };
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const CATEGORY_FIELDS: Record<string, string[]> = {
  apparel: ["size", "color", "material"],
  clothing: ["size", "color", "material"],
  home: ["material"],
  accessories: ["size", "color", "material"],
  beauty: ["ingredients"],
  cosmetics: ["ingredients"],
};

export function requiredAttributesFor(category: string): string[] {
  return CATEGORY_FIELDS[normalizeText(category)] ?? [];
}

export function issueImpact(severity: Severity, reach = 1, fixability: 1 | 0.6 | 0.3 = 1): number {
  return SEVERITY_WEIGHT[severity] * Math.max(1, reach) * fixability;
}

function createIssue(
  product: Product,
  ruleId: (typeof RULE_IDS)[number],
  category: string,
  severity: Severity,
  field: string,
  evidence: string,
  currentValue: string,
  reach = 1,
  fixability: 1 | 0.6 | 0.3 = 1,
): AuditIssue {
  return {
    id: `${ruleId}:${product.id}:${field}:${contentHash(evidence)}`,
    ruleId,
    category,
    severity,
    productId: product.id,
    productTitle: product.title,
    field,
    evidence,
    currentValue,
    impact: issueImpact(severity, reach, fixability),
  };
}

function isKeywordStuffed(alt: string): boolean {
  const words = normalizeText(alt)
    .split(" ")
    .filter((word) => word.length > 2);
  if (words.length < 6) return false;
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  return (
    [...counts.values()].some((count) => count >= 3) ||
    [...counts.values()].some((count) => count / words.length >= 0.5)
  );
}

export function hasMalformedOrBloatedHtml(html: string): boolean {
  if (/<(?!\/?[a-z][a-z0-9-]*(?:\s[^<>]*?)?\s*\/?>|!--)/i.test(html)) return true;
  const stack: string[] = [];
  const tags = /<!--([\s\S]*?)-->|<\/?([a-z][a-z0-9-]*)\b([^<>]*?)>/gi;
  for (const match of html.matchAll(tags)) {
    if (match[1] !== undefined) continue;
    const token = match[0];
    const tag = match[2].toLowerCase();
    const attributes = match[3] ?? "";
    if (/\bstyle\s*=/i.test(attributes)) return true;
    const isClosing = /^<\//.test(token);
    const isSelfClosing = /\/\s*>$/.test(token);
    if (VOID_TAGS.has(tag) || isSelfClosing) continue;
    if (isClosing) {
      if (stack.pop() !== tag) return true;
    } else {
      stack.push(tag);
      if (new RegExp(`<${tag}\\b[^>]*>\\s*<\\/${tag}\\s*>`, "i").test(html)) return true;
    }
  }
  return stack.length > 0;
}

export function extractInternalProductHandles(description: string): string[] {
  const handles: string[] = [];
  const hrefs = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  for (const match of description.matchAll(hrefs)) {
    const value = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (!value.startsWith("/") || value.startsWith("//")) continue;
    const productPath = value.split(/[?#]/, 1)[0].match(/^\/products\/([^/]+)\/?$/i);
    if (productPath?.[1]) {
      try {
        handles.push(decodeURIComponent(productPath[1]));
      } catch {
        handles.push(productPath[1]);
      }
    }
  }
  return handles;
}

function invalidJsonMetafields(product: Product): string[] {
  return Object.entries(product.metafields ?? {})
    .filter(([, metafield]) => metafield.type.toLowerCase() === "json")
    .filter(([, metafield]) => {
      try {
        JSON.parse(metafield.value);
        return false;
      } catch {
        return true;
      }
    })
    .map(([key]) => key);
}

export function auditProducts(
  products: Product[],
  threshold = 0.8,
  externallyBrokenProductIds: ReadonlySet<string> = new Set(),
): AuditIssue[] {
  const results: AuditIssue[] = [];
  const seoTitleOwners = new Map<string, Product[]>();
  const handles = new Set(products.map((product) => product.handle.toLowerCase()).filter(Boolean));
  const inboundHandles = new Set<string>();
  for (const product of products)
    for (const target of extractInternalProductHandles(product.description))
      inboundHandles.add(target.toLowerCase());

  for (const product of products) {
    const seoTitle = product.seoTitle.trim();
    const metaDescription = product.seoDescription.trim();
    const normalizedSeoTitle = normalizeText(seoTitle);
    if (!normalizedSeoTitle) {
      results.push(
        createIssue(
          product,
          "SEO-001",
          "SEO metadata",
          "critical",
          "seoTitle",
          "SEO title is empty",
          seoTitle,
        ),
      );
    } else {
      const owners = seoTitleOwners.get(normalizedSeoTitle) ?? [];
      owners.push(product);
      seoTitleOwners.set(normalizedSeoTitle, owners);
      if (seoTitle.length < 30 || seoTitle.length > 60)
        results.push(
          createIssue(
            product,
            "SEO-002",
            "SEO metadata",
            "medium",
            "seoTitle",
            `${seoTitle.length} characters; expected 30-60`,
            seoTitle,
          ),
        );
    }
    if (!metaDescription) {
      results.push(
        createIssue(
          product,
          "SEO-004",
          "SEO metadata",
          "high",
          "seoDescription",
          "Meta description is empty",
          metaDescription,
        ),
      );
    } else if (metaDescription.length < 70 || metaDescription.length > 160) {
      results.push(
        createIssue(
          product,
          "SEO-005",
          "SEO metadata",
          "medium",
          "seoDescription",
          `${metaDescription.length} characters; expected 70-160`,
          metaDescription,
        ),
      );
    }
    if (
      !product.handle ||
      product.handle !== product.handle.toLowerCase() ||
      /[^a-z0-9-]/.test(product.handle) ||
      product.handle.length > 75 ||
      /^\d+$/.test(product.handle)
    ) {
      results.push(
        createIssue(
          product,
          "SEO-006",
          "SEO metadata",
          "low",
          "handle",
          "Handle is empty, uppercase, malformed, too long, or numeric-only",
          product.handle,
        ),
      );
    }

    for (const image of product.images) {
      const alt = image.alt.trim();
      const filename = image.url.split("/").pop()?.split(/[?#]/)[0] ?? "";
      if (!alt) {
        results.push(
          createIssue(
            product,
            "IMG-001",
            "Image accessibility",
            "high",
            "images.alt",
            "Image alt text is missing",
            "",
          ),
        );
      } else if (
        normalizeText(alt) === normalizeText(filename) ||
        normalizeText(alt) === normalizeText(filename.replace(/\.[a-z0-9]{2,5}$/i, "")) ||
        alt.length < 5 ||
        isKeywordStuffed(alt)
      ) {
        results.push(
          createIssue(
            product,
            "IMG-002",
            "Image accessibility",
            "medium",
            "images.alt",
            "Alt text resembles a filename, is too short, or repeats keywords",
            alt,
          ),
        );
      }
    }

    const description = product.description;
    if (wordCount(description) < 50)
      results.push(
        createIssue(
          product,
          "CNT-001",
          "Content uniqueness",
          "high",
          "description",
          `Description has ${wordCount(description)} words; expected at least 50`,
          description,
        ),
      );
    if (hasMalformedOrBloatedHtml(description))
      results.push(
        createIssue(
          product,
          "CNT-004",
          "Content uniqueness",
          "low",
          "description",
          "Description contains malformed, empty, or bloated HTML",
          description,
        ),
      );

    if (
      !product.vendor.trim() ||
      !product.productType.trim() ||
      !Number.isFinite(product.price) ||
      !product.sku.trim() ||
      !product.tags.some((tag) => tag.trim())
    ) {
      results.push(
        createIssue(
          product,
          "DAT-001",
          "Attributes",
          "high",
          "catalog",
          "One or more required catalog fields are missing",
          [
            product.vendor,
            product.productType,
            product.price,
            product.sku,
            product.tags.length,
          ].join(" | "),
        ),
      );
    }
    const badMetafields = invalidJsonMetafields(product);
    if (product.price <= 0 || (product.gtin && !validGtin(product.gtin)) || badMetafields.length) {
      results.push(
        createIssue(
          product,
          "DAT-002",
          "Attributes",
          "high",
          "metadata",
          `Invalid price, GTIN, or JSON metafield${badMetafields.length ? `: ${badMetafields.join(", ")}` : ""}`,
          `${product.price} | ${product.gtin ?? "no GTIN"}`,
        ),
      );
    }
    const required = requiredAttributesFor(product.productType);
    const missing = required.filter((key) => !product.attributes[key]?.trim());
    if (missing.length)
      results.push(
        createIssue(
          product,
          "DAT-003",
          "Attributes",
          "medium",
          "attributes",
          `Missing ${missing.join(", ")}`,
          "",
        ),
      );

    const productLinks = extractInternalProductHandles(description);
    const missingTargets = productLinks.filter((handle) => !handles.has(handle.toLowerCase()));
    if (externallyBrokenProductIds.has(product.id) || missingTargets.length)
      results.push(
        createIssue(
          product,
          "LNK-001",
          "Internal links",
          "medium",
          "description.links",
          `Broken internal product link${missingTargets.length ? `: ${missingTargets.join(", ")}` : ""}`,
          description,
        ),
      );
    if (!product.collections.length && !inboundHandles.has(product.handle.toLowerCase()))
      results.push(
        createIssue(
          product,
          "LNK-002",
          "Internal links",
          "medium",
          "collections",
          "Product has no collection and no inbound product link",
          "",
        ),
      );

    const schemaIssues = validateProductJsonLd(productJsonLd(product));
    const requiredSchemaIssues = schemaIssues.filter((item) => item.severity === "critical");
    const recommendedSchemaIssues = schemaIssues.filter((item) => item.severity === "low");
    if (requiredSchemaIssues.length)
      results.push(
        createIssue(
          product,
          "SCH-001",
          "Structured data",
          "critical",
          "jsonld.required",
          requiredSchemaIssues.map((item) => item.field).join(", "),
          JSON.stringify(productJsonLd(product)),
        ),
      );
    if (recommendedSchemaIssues.length)
      results.push(
        createIssue(
          product,
          "SCH-002",
          "Structured data",
          "low",
          "jsonld.recommended",
          recommendedSchemaIssues.map((item) => item.field).join(", "),
          JSON.stringify(productJsonLd(product)),
        ),
      );
  }

  for (const [title, owners] of seoTitleOwners) {
    if (owners.length < 2) continue;
    for (const product of owners)
      results.push(
        createIssue(
          product,
          "SEO-003",
          "SEO metadata",
          "high",
          "seoTitle",
          `SEO title duplicated across ${owners.length} products`,
          title,
          owners.length,
          0.6,
        ),
      );
  }

  const descriptionGroups = new Map<string, Product[]>();
  for (const product of products) {
    const key = contentHash(product.description);
    const group = descriptionGroups.get(key) ?? [];
    group.push(product);
    descriptionGroups.set(key, group);
  }
  for (const candidates of descriptionGroups.values()) {
    const byNormalizedDescription = new Map<string, Product[]>();
    for (const product of candidates) {
      const normalized = normalizeText(product.description);
      const group = byNormalizedDescription.get(normalized) ?? [];
      group.push(product);
      byNormalizedDescription.set(normalized, group);
    }
    for (const cluster of byNormalizedDescription.values()) {
      if (cluster.length < 2) continue;
      for (const product of cluster)
        results.push(
          createIssue(
            product,
            "CNT-002",
            "Content uniqueness",
            "critical",
            "description",
            `Exact normalized-description duplicate cluster of ${cluster.length} products`,
            product.description,
            cluster.length,
            0.6,
          ),
        );
    }
  }

  for (let left = 0; left < products.length; left++) {
    for (let right = left + 1; right < products.length; right++) {
      const a = products[left];
      const b = products[right];
      if (normalizeText(a.description) === normalizeText(b.description)) continue;
      const similarity = jaccardSimilarity(a.description, b.description);
      if (similarity < threshold) continue;
      const evidence = `Near-duplicate candidate (${similarity.toFixed(2)} Jaccard) with ${b.title}`;
      results.push(
        createIssue(
          a,
          "CNT-003",
          "Content uniqueness",
          "high",
          "description",
          evidence,
          a.description,
          2,
          0.6,
        ),
      );
      results.push(
        createIssue(
          b,
          "CNT-003",
          "Content uniqueness",
          "high",
          "description",
          `Near-duplicate candidate (${similarity.toFixed(2)} Jaccard) with ${a.title}`,
          b.description,
          2,
          0.6,
        ),
      );
    }
  }
  return results;
}

export function validGtin(value: string): boolean {
  if (!/^(?:\d{8}|\d{12,14})$/.test(value)) return false;
  const digits = [...value].map(Number);
  const checkDigit = digits.pop();
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return checkDigit === (10 - (sum % 10)) % 10;
}
