import type { AuditIssue, Product, Severity } from "../types";
import { contentHash, normalizeText, wordCount } from "../text";
import { jaccardSimilarity } from "../duplicates";
import { productJsonLd, validateProductJsonLd } from "../jsonld";

const WEIGHT: Record<Severity, number> = { critical: 10, high: 6, medium: 3, low: 1 };
const issue = (
  p: Product,
  ruleId: string,
  category: string,
  severity: Severity,
  field: string,
  evidence: string,
  value: string,
): AuditIssue => ({
  id: `${ruleId}:${p.id}:${field}`,
  ruleId,
  category,
  severity,
  productId: p.id,
  productTitle: p.title,
  field,
  evidence,
  currentValue: value,
  impact: WEIGHT[severity],
});

export function auditProducts(
  products: Product[],
  threshold = 0.8,
  brokenInternalLinks: ReadonlySet<string> = new Set(),
): AuditIssue[] {
  const results: AuditIssue[] = [];
  const titleCounts = new Map<string, number>();
  for (const p of products) {
    const k = normalizeText(p.seoTitle);
    if (k) titleCounts.set(k, (titleCounts.get(k) ?? 0) + 1);
  }
  for (const p of products) {
    const seo = p.seoTitle.trim();
    const meta = p.seoDescription.trim();
    if (!seo)
      results.push(
        issue(p, "SEO-001", "SEO metadata", "critical", "seoTitle", "SEO title is empty", seo),
      );
    else if (seo.length < 30 || seo.length > 60)
      results.push(
        issue(
          p,
          "SEO-002",
          "SEO metadata",
          "medium",
          "seoTitle",
          `${seo.length} characters; expected 30-60`,
          seo,
        ),
      );
    if (seo && (titleCounts.get(normalizeText(seo)) ?? 0) > 1)
      results.push(
        issue(p, "SEO-003", "SEO metadata", "high", "seoTitle", "SEO title is duplicated", seo),
      );
    if (!meta)
      results.push(
        issue(
          p,
          "SEO-004",
          "SEO metadata",
          "high",
          "seoDescription",
          "Meta description is empty",
          meta,
        ),
      );
    else if (meta.length < 70 || meta.length > 160)
      results.push(
        issue(
          p,
          "SEO-005",
          "SEO metadata",
          "medium",
          "seoDescription",
          `${meta.length} characters; expected 70-160`,
          meta,
        ),
      );
    if (
      p.handle !== p.handle.toLowerCase() ||
      /[^a-z0-9-]/.test(p.handle) ||
      p.handle.length > 75 ||
      /^\d+$/.test(p.handle)
    )
      results.push(
        issue(
          p,
          "SEO-006",
          "SEO metadata",
          "low",
          "handle",
          "Handle is uppercase, malformed, too long, or numeric-only",
          p.handle,
        ),
      );
    for (const image of p.images) {
      const filename = image.url.split("/").pop()?.split("?")[0] ?? "";
      if (!image.alt.trim())
        results.push(
          issue(
            p,
            "IMG-001",
            "Image accessibility",
            "high",
            "images.alt",
            "Image alt text is missing",
            "",
          ),
        );
      else if (
        normalizeText(image.alt) === normalizeText(filename) ||
        image.alt.trim().length < 5 ||
        (image.alt.match(/\b\w+\b/g)?.length ?? 0) > 20
      )
        results.push(
          issue(
            p,
            "IMG-002",
            "Image accessibility",
            "medium",
            "images.alt",
            "Alt text resembles a filename, is too short, or is keyword-stuffed",
            image.alt,
          ),
        );
    }
    if (wordCount(p.description) < 50)
      results.push(
        issue(
          p,
          "CNT-001",
          "Content uniqueness",
          "high",
          "description",
          `Description has ${wordCount(p.description)} words; expected at least 50`,
          p.description,
        ),
      );
    const openingTags = [...p.description.matchAll(/<([a-z]+)\b[^>]*>/gi)]
      .map((match) => match[1].toLowerCase())
      .filter(
        (tag) => !["img", "br", "hr", "input", "meta", "link", "source", "wbr"].includes(tag),
      );
    const unclosed = openingTags.some(
      (tag) =>
        countMatches(p.description, `<${tag}\\b`) > countMatches(p.description, `<\\/${tag}\\s*>`),
    );
    if (unclosed || /\bstyle\s*=|<\w+\b[^>]*>\s*<\/\w+>/i.test(p.description))
      results.push(
        issue(
          p,
          "CNT-004",
          "Content uniqueness",
          "low",
          "description",
          "Description contains unclosed or empty tags or inline styling",
          p.description,
        ),
      );
    if (!p.vendor || !p.productType || p.price <= 0 || !p.sku || !p.tags.length)
      results.push(
        issue(
          p,
          "DAT-001",
          "Attributes",
          "high",
          "catalog",
          "One or more required fields are missing or invalid",
          [p.vendor, p.productType, p.price, p.sku, p.tags.length].join(" | "),
        ),
      );
    if (p.price <= 0 || (p.gtin && !validGtin(p.gtin)))
      results.push(
        issue(
          p,
          "DAT-002",
          "Attributes",
          "high",
          "metadata",
          "Price or GTIN metadata is invalid",
          `${p.price} | ${p.gtin ?? "no GTIN"}`,
        ),
      );
    const required = CATEGORY_FIELDS[p.productType.toLowerCase()] ?? [];
    const missing = required.filter((key) => !p.attributes[key]);
    if (missing.length)
      results.push(
        issue(
          p,
          "DAT-003",
          "Attributes",
          "medium",
          "attributes",
          `Missing ${missing.join(", ")}`,
          "",
        ),
      );
    if (!p.collections.length)
      results.push(
        issue(
          p,
          "LNK-002",
          "Internal links",
          "medium",
          "collections",
          "Product is not assigned to a collection",
          "",
        ),
      );
    if (brokenInternalLinks.has(p.id))
      results.push(
        issue(
          p,
          "LNK-001",
          "Internal links",
          "medium",
          "description.links",
          "Internal product link is broken or exceeds the permitted redirect chain",
          p.description,
        ),
      );
    const schemaIssues = validateProductJsonLd(productJsonLd(p));
    if (schemaIssues.some((item) => item.severity === "critical"))
      results.push(
        issue(
          p,
          "SCH-001",
          "Structured data",
          "critical",
          "jsonld.required",
          schemaIssues
            .filter((item) => item.severity === "critical")
            .map((item) => item.field)
            .join(", "),
          JSON.stringify(productJsonLd(p)),
        ),
      );
    if (schemaIssues.some((item) => item.severity === "low"))
      results.push(
        issue(
          p,
          "SCH-002",
          "Structured data",
          "low",
          "jsonld.recommended",
          schemaIssues
            .filter((item) => item.severity === "low")
            .map((item) => item.field)
            .join(", "),
          JSON.stringify(productJsonLd(p)),
        ),
      );
  }
  const seen = new Map<string, Product[]>();
  for (const p of products) {
    const key = contentHash(p.description);
    const cluster = seen.get(key) ?? [];
    cluster.push(p);
    seen.set(key, cluster);
  }
  for (const cluster of seen.values())
    if (cluster.length > 1)
      for (const p of cluster)
        results.push(
          issue(
            p,
            "CNT-002",
            "Content uniqueness",
            "critical",
            "description",
            `Exact description duplicate cluster of ${cluster.length} products`,
            p.description,
          ),
        );
  for (let i = 0; i < products.length; i++)
    for (let j = i + 1; j < products.length; j++) {
      if (
        contentHash(products[i].description) !== contentHash(products[j].description) &&
        jaccardSimilarity(products[i].description, products[j].description) >= threshold
      ) {
        results.push(
          issue(
            products[i],
            "CNT-003",
            "Content uniqueness",
            "high",
            "description",
            `Near-duplicate candidate with ${products[j].title}`,
            products[i].description,
          ),
        );
        results.push(
          issue(
            products[j],
            "CNT-003",
            "Content uniqueness",
            "high",
            "description",
            `Near-duplicate candidate with ${products[i].title}`,
            products[j].description,
          ),
        );
      }
    }
  return results;
}

const CATEGORY_FIELDS: Record<string, string[]> = {
  apparel: ["size", "color", "material"],
  beauty: ["ingredients"],
  home: ["material"],
};
export function validGtin(value: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function countMatches(value: string, pattern: string): number {
  return (value.match(new RegExp(pattern, "gi")) ?? []).length;
}

export function exactDuplicateGroups(products: Product[]): Product[][] {
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const key = contentHash(p.description);
    const group = groups.get(key) ?? [];
    group.push(p);
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}
