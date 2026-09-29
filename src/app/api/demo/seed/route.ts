import { NextResponse } from "next/server";
import { z } from "zod";
import demoProducts from "@/data/demo-store.json";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";
import { fromDemoProductRow } from "@/lib/jobs/demo-products";

const requestSchema = z.object({ idempotencyKey: z.string().uuid().optional() }).strict();

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("INVALID_INPUT", "Invalid seed request", 400);

  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return apiError("UNAUTHENTICATED", "Sign in to load a saved Demo Store", 401);
    if (role !== "Owner" && role !== "Editor")
      return apiError("FORBIDDEN", "Editor access is required", 403);

    const { data: existingStore, error: storeReadError } = await supabase
      .from("stores")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("type", "demo")
      .eq("name", "Northstar Goods")
      .maybeSingle();
    if (storeReadError) return apiError("STORE_READ_FAILED", "Could not load the Demo Store", 500);

    let storeId = existingStore?.id as string | undefined;
    if (!storeId) {
      const { data: createdStore, error: storeInsertError } = await supabase
        .from("stores")
        .insert({ workspace_id: workspaceId, name: "Northstar Goods", type: "demo" })
        .select("id")
        .single();
      if (storeInsertError) {
        const { data: racedStore } = await supabase
          .from("stores")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("type", "demo")
          .eq("name", "Northstar Goods")
          .maybeSingle();
        if (!racedStore)
          return apiError("STORE_CREATE_FAILED", "Could not create the Demo Store", 500);
        storeId = racedStore.id as string;
      } else {
        storeId = createdStore.id as string;
      }
    }

    const idempotencyKey = parsed.data.idempotencyKey ?? crypto.randomUUID();
    const { data: existingJob, error: jobReadError } = await supabase
      .from("jobs")
      .select("id,status,total_items,completed_items,failed_items")
      .eq("workspace_id", workspaceId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (jobReadError) return apiError("JOB_READ_FAILED", "Could not check import progress", 500);
    if (existingJob) return NextResponse.json({ job: existingJob, storeId });

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .insert({
        workspace_id: workspaceId,
        store_id: storeId,
        type: "demo_seed",
        status: "queued",
        cursor: { offset: 0 },
        progress: { completed: 0, failed: 0, created: 0, updated: 0, skipped: 0 },
        total_items: demoProducts.length,
        payload: { source: "deterministic-demo-seed-v1" },
        idempotency_key: idempotencyKey,
      })
      .select("id,status,total_items,completed_items,failed_items")
      .single();
    if (jobError) {
      const { data: racedJob } = await supabase
        .from("jobs")
        .select("id,status,total_items,completed_items,failed_items")
        .eq("workspace_id", workspaceId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (!racedJob)
        return apiError("JOB_CREATE_FAILED", "Could not start the Demo Store import", 500);
      return NextResponse.json({ job: racedJob, storeId });
    }
    return NextResponse.json({ job, storeId }, { status: 202 });
  } catch {
    return apiError("PERSISTENCE_UNAVAILABLE", "Configure Supabase to save the Demo Store", 503);
  }
}

export async function GET() {
  try {
    const { supabase, user, workspaceId } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return apiError("UNAUTHENTICATED", "Sign in to load saved products", 401);
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("type", "demo")
      .eq("name", "Northstar Goods")
      .maybeSingle();
    if (storeError) return apiError("STORE_READ_FAILED", "Could not load the Demo Store", 500);
    if (!store)
      return apiError("STORE_NOT_FOUND", "Load the Demo Store before requesting products", 404);

    const { data: rows, error: productsError } = await supabase
      .from("products")
      .select(
        "id,external_id,handle,title,vendor,description_html,seo_title,seo_description,category,attributes,price,sku,tags,gtin",
      )
      .eq("workspace_id", workspaceId)
      .eq("store_id", store.id)
      .order("external_id");
    if (productsError) return apiError("PRODUCT_READ_FAILED", "Could not load saved products", 500);

    const ids = (rows ?? []).map((row) => row.id as string);
    const { data: imageRows, error: imagesError } = ids.length
      ? await supabase
          .from("product_images")
          .select("product_id,url,alt,position")
          .eq("workspace_id", workspaceId)
          .in("product_id", ids)
          .order("position")
      : { data: [], error: null };
    if (imagesError) return apiError("IMAGE_READ_FAILED", "Could not load product images", 500);

    const imagesByProduct = new Map<string, { url: string; alt: string }[]>();
    for (const image of imageRows ?? []) {
      const images = imagesByProduct.get(image.product_id as string) ?? [];
      images.push({ url: image.url as string, alt: image.alt as string });
      imagesByProduct.set(image.product_id as string, images);
    }
    const products = (rows ?? []).map((row) =>
      fromDemoProductRow(
        row as Parameters<typeof fromDemoProductRow>[0],
        imagesByProduct.get(row.id as string) ?? [],
      ),
    );
    return NextResponse.json({ storeId: store.id, products });
  } catch {
    return apiError("PERSISTENCE_UNAVAILABLE", "Configure Supabase to load saved products", 503);
  }
}
