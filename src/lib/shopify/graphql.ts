import { z } from "zod";
import { validShopDomain } from "@/lib/shopify/oauth";

const apiEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});
const updateResponseSchema = z.object({
  productUpdate: z.object({
    product: z.object({ id: z.string() }).nullable(),
    userErrors: z.array(z.object({ field: z.array(z.string()).nullable(), message: z.string() })),
  }),
});

export type ShopifyProductPage = {
  products: {
    nodes: ShopifyProductNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type ShopifyProductNode = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  seo: { title: string | null; description: string | null };
  category: { id: string; name: string } | null;
  images: { nodes: { url: string; altText: string | null }[] };
  variants: { nodes: { sku: string | null; barcode: string | null; price: string }[] };
};

const productNodeSchema: z.ZodType<ShopifyProductNode> = z.object({
  id: z.string().startsWith("gid://shopify/Product/"),
  handle: z.string(),
  title: z.string(),
  descriptionHtml: z.string(),
  vendor: z.string().default(""),
  productType: z.string().default(""),
  tags: z.array(z.string()).default([]),
  seo: z.object({ title: z.string().nullable(), description: z.string().nullable() }),
  category: z.object({ id: z.string(), name: z.string() }).nullable(),
  images: z.object({
    nodes: z.array(z.object({ url: z.string().url(), altText: z.string().nullable() })),
  }),
  variants: z.object({
    nodes: z.array(
      z.object({ sku: z.string().nullable(), barcode: z.string().nullable(), price: z.string() }),
    ),
  }),
});

const productsPageSchema: z.ZodType<ShopifyProductPage> = z.object({
  products: z.object({
    nodes: z.array(productNodeSchema),
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
  }),
});

const productPageQuery = `query ImportProducts($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: ID) {
    nodes {
      id handle title descriptionHtml vendor productType tags seo { title description }
      category { id name }
      images(first: 20) { nodes { url altText } }
      variants(first: 1) { nodes { sku barcode price } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export async function fetchShopifyProductPage(
  shop: string,
  token: string,
  apiVersion: string,
  after: string | null,
  fetcher: typeof fetch = fetch,
): Promise<ShopifyProductPage> {
  const version = z
    .string()
    .regex(/^20\d{2}-(01|04|07|10)$/)
    .safeParse(apiVersion);
  if (!validShopDomain(shop) || !version.success)
    throw new Error("Invalid Shopify store domain or API version");
  const response = await fetcher(`https://${shop}/admin/api/${version.data}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query: productPageQuery, variables: { first: 10, after } }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Shopify returned HTTP ${response.status}`);
  const envelope = apiEnvelopeSchema.parse(await response.json());
  if (envelope.errors?.length)
    throw new Error(envelope.errors.map((error) => error.message).join("; "));
  return productsPageSchema.parse(envelope.data);
}

const productUpdateMutation = `mutation UpdateProduct($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id } userErrors { field message } }
}`;

export async function updateShopifyProduct(
  shop: string,
  token: string,
  apiVersion: string,
  productId: string,
  field: string,
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const version = z
    .string()
    .regex(/^20\d{2}-(01|04|07|10)$/)
    .safeParse(apiVersion);
  if (!validShopDomain(shop) || !version.success || !productId.startsWith("gid://shopify/Product/"))
    throw new Error("Invalid Shopify product target");
  const product: Record<string, unknown> = { id: productId };
  if (field === "title") product.title = value;
  else if (field === "description") product.descriptionHtml = value;
  else if (field === "seoTitle") product.seo = { title: value };
  else if (field === "seoDescription") product.seo = { description: value };
  else throw new Error("Shopify publishing does not support this field");

  const response = await fetcher(`https://${shop}/admin/api/${version.data}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query: productUpdateMutation, variables: { product } }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Shopify returned HTTP ${response.status}`);
  const envelope = apiEnvelopeSchema.parse(await response.json());
  if (envelope.errors?.length)
    throw new Error(envelope.errors.map((error) => error.message).join("; "));
  const result = updateResponseSchema.parse(envelope.data).productUpdate;
  if (!result.product || result.userErrors.length)
    throw new Error(
      result.userErrors.map((error) => error.message).join("; ") ||
        "Shopify did not return the updated product",
    );
}
