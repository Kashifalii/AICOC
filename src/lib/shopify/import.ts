import { createHash } from "node:crypto";
import type { ShopifyProductNode } from "@/lib/shopify/graphql";

export function mapShopifyProduct(
  product: ShopifyProductNode,
  workspaceId: string,
  storeId: string,
) {
  const variant = product.variants.nodes[0];
  const contentHash = createHash("sha256").update(JSON.stringify(product)).digest("hex");
  const parsedPrice = variant ? Number(variant.price) : Number.NaN;
  return {
    row: {
      workspace_id: workspaceId,
      store_id: storeId,
      external_id: product.id,
      handle: product.handle,
      title: product.title,
      description_html: product.descriptionHtml,
      vendor: product.vendor,
      seo_title: product.seo.title ?? "",
      seo_description: product.seo.description ?? "",
      category: product.category?.name ?? null,
      attributes: {},
      metafields: {},
      price: Number.isFinite(parsedPrice) ? parsedPrice : null,
      sku: variant?.sku ?? null,
      tags: product.tags,
      gtin: variant?.barcode ?? null,
      content_hash: contentHash,
    },
    images: product.images.nodes.map((image, position) => ({
      workspace_id: workspaceId,
      url: image.url,
      alt: image.altText ?? "",
      position,
    })),
  };
}
