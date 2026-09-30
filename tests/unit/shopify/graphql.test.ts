import { describe, expect, it, vi } from "vitest";
import { fetchShopifyProductPage, updateShopifyProduct } from "@/lib/shopify/graphql";
import { mapShopifyProduct } from "@/lib/shopify/import";

const product = {
  id: "gid://shopify/Product/22",
  handle: "linen-shirt",
  title: "Linen Shirt",
  descriptionHtml: "<p>Natural linen</p>",
  vendor: "Northstar",
  productType: "Shirts",
  tags: ["linen"],
  seo: { title: "Linen Shirt", description: "A breathable shirt." },
  category: { id: "gid://shopify/TaxonomyCategory/aa", name: "Shirts" },
  images: { nodes: [{ url: "https://cdn.shopify.com/a.jpg", altText: "Linen shirt" }] },
  variants: { nodes: [{ sku: "L-1", barcode: "0123", price: "49.00" }] },
};

describe("Shopify Admin GraphQL adapter", () => {
  it("imports a validated product page with a cursor and server token", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "x-shopify-access-token": "server-token" });
      const body = JSON.parse(String(init?.body)) as {
        variables: { first: number; after: string | null };
      };
      expect(body.variables).toEqual({ first: 10, after: "cursor-1" });
      return Response.json({
        data: {
          products: { nodes: [product], pageInfo: { hasNextPage: true, endCursor: "cursor-2" } },
        },
      });
    });
    const result = await fetchShopifyProductPage(
      "northstar.myshopify.com",
      "server-token",
      "2026-04",
      "cursor-1",
      fetcher,
    );
    expect(result.products.nodes[0]?.id).toBe(product.id);
    expect(result.products.pageInfo.endCursor).toBe("cursor-2");
  });

  it("updates only supported product fields with Shopify's productUpdate mutation", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        query: string;
        variables: { product: Record<string, unknown> };
      };
      expect(body.query).toContain("productUpdate(product: $product)");
      expect(body.variables.product).toEqual({ id: product.id, seo: { title: "New SEO title" } });
      return Response.json({
        data: { productUpdate: { product: { id: product.id }, userErrors: [] } },
      });
    });
    await updateShopifyProduct(
      "northstar.myshopify.com",
      "token",
      "2026-04",
      product.id,
      "seoTitle",
      "New SEO title",
      fetcher,
    );
    await expect(
      updateShopifyProduct("evil.example", "token", "2026-04", product.id, "title", "Bad", fetcher),
    ).rejects.toThrow("Invalid Shopify product target");
    await expect(
      updateShopifyProduct(
        "northstar.myshopify.com",
        "token",
        "2026-04",
        product.id,
        "handle",
        "new-handle",
        fetcher,
      ),
    ).rejects.toThrow("Shopify publishing does not support this field");
  });

  it("rejects Shopify GraphQL user errors", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: {
          productUpdate: {
            product: null,
            userErrors: [{ field: ["product", "title"], message: "Title is invalid" }],
          },
        },
      }),
    );
    await expect(
      updateShopifyProduct(
        "northstar.myshopify.com",
        "token",
        "2026-04",
        product.id,
        "title",
        "Bad",
        fetcher,
      ),
    ).rejects.toThrow("Title is invalid");
  });

  it("maps the first Shopify variant and product images to tenant-scoped rows", () => {
    const mapped = mapShopifyProduct(product, "workspace-1", "store-1");
    expect(mapped.row).toMatchObject({
      workspace_id: "workspace-1",
      store_id: "store-1",
      external_id: product.id,
      price: 49,
      sku: "L-1",
      gtin: "0123",
      category: "Shirts",
      seo_title: "Linen Shirt",
    });
    expect(mapped.images).toEqual([
      {
        workspace_id: "workspace-1",
        url: "https://cdn.shopify.com/a.jpg",
        alt: "Linen shirt",
        position: 0,
      },
    ]);
  });
});
