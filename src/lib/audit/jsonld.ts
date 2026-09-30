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
  if (typeof json.name !== "string" || !json.name.trim())
    issues.push({ field: "name", severity: "critical", message: "Required field name is missing" });
  if (
    !(typeof json.image === "string" && json.image.trim()) &&
    !(
      Array.isArray(json.image) &&
      json.image.some((value) => typeof value === "string" && value.trim())
    )
  )
    issues.push({
      field: "image",
      severity: "critical",
      message: "Required field image is missing",
    });
  const brand =
    json.brand && typeof json.brand === "object" ? (json.brand as Record<string, unknown>) : {};
  if (typeof brand.name !== "string" || !brand.name.trim())
    issues.push({ field: "brand", severity: "low", message: "Recommended field brand is missing" });
  for (const field of ["price", "priceCurrency", "availability"] as const) {
    if (
      field === "price"
        ? !Number.isFinite(Number(offers[field])) || Number(offers[field]) <= 0
        : typeof offers[field] !== "string" || !offers[field].trim()
    )
      issues.push({
        field: `offers.${field}`,
        severity: "critical",
        message: `Required offers field ${field} is missing`,
      });
  }
  if (typeof offers.priceCurrency === "string" && !/^[A-Z]{3}$/.test(offers.priceCurrency))
    issues.push({
      field: "offers.priceCurrency",
      severity: "critical",
      message: "Currency must be an ISO 4217 code",
    });
  for (const field of ["sku", "gtin"])
    if (typeof json[field] !== "string" || !json[field].trim())
      issues.push({ field, severity: "low", message: `Recommended field ${field} is missing` });
  return issues;
}
