import { contentHash } from "@/lib/audit/text";
import type { Product } from "@/lib/audit/types";

export type DemoProductRow = {
  workspace_id: string;
  store_id: string;
  external_id: string;
  handle: string;
  title: string;
  vendor: string;
  description_html: string;
  seo_title: string;
  seo_description: string;
  category: string;
  attributes: Record<string, string>;
  metafields: Record<string, { type: string; value: string }>;
  price: number;
  sku: string;
  tags: string[];
  gtin: string | null;
  content_hash: string;
};

export function toDemoProductRow(
  product: Product,
  workspaceId: string,
  storeId: string,
): DemoProductRow {
  return {
    workspace_id: workspaceId,
    store_id: storeId,
    external_id: product.id,
    handle: product.handle,
    title: product.title,
    vendor: product.vendor,
    description_html: product.description,
    seo_title: product.seoTitle,
    seo_description: product.seoDescription,
    category: product.productType,
    attributes: product.attributes,
    metafields: product.metafields ?? {},
    price: product.price,
    sku: product.sku,
    tags: product.tags,
    gtin: product.gtin ?? null,
    content_hash: contentHash(product.description),
  };
}

export function fromDemoProductRow(
  row: Omit<DemoProductRow, "content_hash"> & { id: string },
  images: Product["images"],
): Product {
  return {
    id: row.id,
    title: row.title,
    description: row.description_html,
    vendor: row.vendor,
    productType: row.category,
    handle: row.handle,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    price: Number(row.price),
    sku: row.sku,
    tags: row.tags ?? [],
    images,
    collections: [],
    attributes: row.attributes ?? {},
    metafields: row.metafields ?? {},
    ...(row.gtin ? { gtin: row.gtin } : {}),
  };
}
