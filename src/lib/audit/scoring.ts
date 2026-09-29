import type { AuditIssue, Product } from "./types";

export function scoreProduct(product: Product, issues: AuditIssue[]): number {
  const own = issues.filter((item) => item.productId === product.id);
  const count = (rule: string) => own.filter((item) => item.ruleId.startsWith(rule)).length;
  const seo = 100 - Math.min(100, count("SEO-") * 20);
  const uniqueness = 100 - Math.min(100, count("CNT-002") * 100 + count("CNT-003") * 70);
  const structured = 100;
  const content = 75;
  const images = 100 - Math.min(100, count("IMG-") * 25);
  const attributes = 100 - Math.min(100, count("DAT-003") * 40);
  return Math.round(
    (seo * 30 + uniqueness * 20 + structured * 15 + content * 15 + images * 10 + attributes * 10) /
      100,
  );
}

export function scoreStore(products: Product[], issues: AuditIssue[]): number {
  if (!products.length) return 0;
  return Math.round(
    products.reduce((total, product) => total + scoreProduct(product, issues), 0) / products.length,
  );
}
