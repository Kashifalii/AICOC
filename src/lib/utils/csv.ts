import Papa from "papaparse";
import { z } from "zod";
import type { Product } from "@/lib/audit/types";

export const csvProductSchema = z.object({
  title: z.string().trim().min(1),
  handle: z.string().trim().min(1),
  description: z.string().default(""),
  vendor: z.string().default(""),
  productType: z.string().default(""),
  seoTitle: z.string().default(""),
  seoDescription: z.string().default(""),
  price: z.coerce.number().nonnegative(),
  sku: z.string().default(""),
});
export type CsvField = keyof z.input<typeof csvProductSchema>;
export const SHOPIFY_COLUMNS: Record<CsvField, string[]> = {
  title: ["Title"],
  handle: ["Handle"],
  description: ["Body (HTML)", "Body"],
  vendor: ["Vendor"],
  productType: ["Type"],
  seoTitle: ["SEO Title"],
  seoDescription: ["SEO Description"],
  price: ["Variant Price"],
  sku: ["Variant SKU"],
};
export function mapShopifyCsv(csv: string): {
  products: Partial<Product>[];
  errors: { row: number; message: string }[];
} {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
  });
  const products: Partial<Product>[] = [];
  const errors: { row: number; message: string }[] = [];
  for (const [index, row] of parsed.data.entries()) {
    const value: Record<string, unknown> = {};
    for (const [field, aliases] of Object.entries(SHOPIFY_COLUMNS))
      value[field] =
        aliases.map((alias) => row[alias]).find((candidate) => candidate !== undefined) ?? "";
    const result = csvProductSchema.safeParse(value);
    if (result.success) products.push(result.data);
    else
      errors.push({
        row: index + 2,
        message: result.error.issues
          .map((item) => `${item.path.join(".")}: ${item.message}`)
          .join("; "),
      });
  }
  errors.push(
    ...parsed.errors.map((error) => ({ row: (error.row ?? 0) + 1, message: error.message })),
  );
  return { products, errors };
}
