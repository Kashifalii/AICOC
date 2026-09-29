import type { Product } from "./types";
export type JsonLdIssue = { field: string; severity: "critical" | "low"; message: string };
export function productJsonLd(product: Product, currency = "USD"): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: product.images.map((image) => image.url),
    description: product.description,
    sku: product.sku,
    brand: { "@type": "Brand", name: product.vendor },
    ...(product.gtin ? { gtin: product.gtin } : {}),
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: currency,
      availability: "https://schema.org/InStock",
    },
  };
}
export function validateProductJsonLd(json: Record<string, unknown>): JsonLdIssue[] {
  const offers =
    json.offers && typeof json.offers === "object" ? (json.offers as Record<string, unknown>) : {};
  const issues: JsonLdIssue[] = [];
  for (const field of ["name", "image"] as const)
    if (!json[field] || (Array.isArray(json[field]) && !json[field].length))
      issues.push({ field, severity: "critical", message: `Required field ${field} is missing` });
  for (const field of ["price", "priceCurrency", "availability"])
    if (!offers[field])
      issues.push({
        field: `offers.${field}`,
        severity: "critical",
        message: `Required offers field ${field} is missing`,
      });
  for (const field of ["brand", "sku", "gtin"])
    if (!json[field])
      issues.push({ field, severity: "low", message: `Recommended field ${field} is missing` });
  return issues;
}
