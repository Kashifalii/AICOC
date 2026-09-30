import { z } from "zod";

export type Severity = "critical" | "high" | "medium" | "low";
export const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  vendor: z.string(),
  productType: z.string(),
  handle: z.string(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  price: z.number(),
  sku: z.string(),
  tags: z.array(z.string()),
  images: z.array(z.object({ url: z.string(), alt: z.string() })),
  collections: z.array(z.string()),
  attributes: z.record(z.string(), z.string()),
  metafields: z.record(z.string(), z.object({ type: z.string(), value: z.string() })).optional(),
  gtin: z.string().optional(),
});
export type Product = z.infer<typeof productSchema>;
export type AuditIssue = {
  id: string;
  ruleId: string;
  category: string;
  severity: Severity;
  productId: string;
  productTitle: string;
  field: string;
  evidence: string;
  impact: number;
  currentValue: string;
};
