import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";
import { roleCan } from "@/lib/authz/roles";

const paramsSchema = z.object({ storeId: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ storeId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success)
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid store id." } },
      { status: 400 },
    );
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to load products." } },
        { status: 401 },
      );
    if (!roleCan(role, "product:read"))
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Your workspace role cannot view products." } },
        { status: 403 },
      );
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id")
      .eq("id", params.data.storeId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (storeError)
      return NextResponse.json(
        { error: { code: "STORE_READ_FAILED", message: "Could not verify store access." } },
        { status: 500 },
      );
    if (!store)
      return NextResponse.json(
        {
          error: { code: "STORE_NOT_FOUND", message: "Store is not available in this workspace." },
        },
        { status: 404 },
      );

    const { data: rows, error: productsError } = await supabase
      .from("products")
      .select(
        "id,external_id,handle,title,vendor,description_html,seo_title,seo_description,category,attributes,metafields,price,sku,tags,gtin",
      )
      .eq("workspace_id", workspaceId)
      .eq("store_id", store.id)
      .order("title");
    if (productsError)
      return NextResponse.json(
        { error: { code: "PRODUCT_READ_FAILED", message: "Could not load store products." } },
        { status: 500 },
      );

    const ids = (rows ?? []).map((row) => row.id);
    const { data: imageRows, error: imageError } = ids.length
      ? await supabase
          .from("product_images")
          .select("product_id,url,alt,position")
          .eq("workspace_id", workspaceId)
          .in("product_id", ids)
          .order("position")
      : { data: [], error: null };
    if (imageError)
      return NextResponse.json(
        { error: { code: "IMAGE_READ_FAILED", message: "Could not load product images." } },
        { status: 500 },
      );

    const imagesByProduct = new Map<string, { url: string; alt: string }[]>();
    for (const image of imageRows ?? []) {
      const productImages = imagesByProduct.get(image.product_id) ?? [];
      productImages.push({ url: image.url, alt: image.alt });
      imagesByProduct.set(image.product_id, productImages);
    }
    const products = (rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description_html,
      vendor: row.vendor,
      productType: row.category ?? "",
      handle: row.handle,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
      price: Number(row.price ?? 0),
      sku: row.sku ?? "",
      tags: row.tags ?? [],
      images: imagesByProduct.get(row.id) ?? [],
      collections: [],
      attributes: row.attributes ?? {},
      metafields: row.metafields ?? {},
      ...(row.gtin ? { gtin: row.gtin } : {}),
    }));
    return NextResponse.json({ storeId: store.id, products });
  } catch {
    return NextResponse.json(
      {
        error: { code: "PRODUCTS_UNAVAILABLE", message: "Product access requires Supabase Auth." },
      },
      { status: 503 },
    );
  }
}
