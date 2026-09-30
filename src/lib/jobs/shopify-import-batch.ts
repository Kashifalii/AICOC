import "server-only";
import { z } from "zod";
import type { createSessionClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/security/crypto";
import { fetchShopifyProductPage } from "@/lib/shopify/graphql";
import { mapShopifyProduct } from "@/lib/shopify/import";
import { env } from "@/config/env";

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;
type ClaimedJob = { id: string; store_id: string | null; cursor: unknown; progress: unknown };
const cursorSchema = z.object({ after: z.string().nullable().optional() });
const progressSchema = z.object({
  completed: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  created: z.number().int().nonnegative().default(0),
  updated: z.number().int().nonnegative().default(0),
  skipped: z.number().int().nonnegative().default(0),
  total: z.number().int().nonnegative().default(0),
});

export async function runShopifyImportBatch(
  supabase: SessionClient,
  workspaceId: string,
  job: ClaimedJob,
  workerToken: string,
) {
  if (!job.store_id)
    return {
      status: 400,
      body: { error: { code: "JOB_INVALID", message: "Import job has no store" } },
    };
  const cursor = cursorSchema.parse(job.cursor ?? {});
  const prior = progressSchema.parse(job.progress ?? {});
  const releaseLease = async () => {
    await supabase.rpc("checkpoint_batch_job", {
      target_job: job.id,
      worker_token: workerToken,
      next_cursor: cursor,
      next_progress: prior,
      next_status: "queued",
      item_results: [],
    });
  };
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id,domain,token_encrypted,api_version")
    .eq("id", job.store_id)
    .eq("workspace_id", workspaceId)
    .eq("type", "shopify")
    .maybeSingle();
  if (storeError || !store?.domain || !store.token_encrypted) {
    await releaseLease();
    return {
      status: 409,
      body: {
        error: {
          code: "STORE_NOT_CONNECTED",
          message: "Shopify store credentials are unavailable",
        },
      },
    };
  }
  let page;
  try {
    page = await fetchShopifyProductPage(
      store.domain,
      decryptSecret(store.token_encrypted),
      store.api_version ?? env.SHOPIFY_API_VERSION,
      cursor.after ?? null,
    );
  } catch {
    await releaseLease();
    return {
      status: 502,
      body: {
        error: {
          code: "SHOPIFY_IMPORT_FAILED",
          message: "Shopify import batch failed; retry the job",
        },
      },
    };
  }

  const progress = { ...prior, total: prior.total + page.products.nodes.length };
  const itemResults: {
    item_key: string;
    status: "succeeded" | "failed";
    result?: object;
    error?: object;
  }[] = [];
  const externalIds = page.products.nodes.map((product) => product.id);
  const { data: previousRows, error: previousError } = externalIds.length
    ? await supabase
        .from("products")
        .select("id,external_id,content_hash")
        .eq("workspace_id", workspaceId)
        .eq("store_id", store.id)
        .in("external_id", externalIds)
    : { data: [], error: null };
  if (previousError) {
    await releaseLease();
    return {
      status: 500,
      body: { error: { code: "PRODUCT_READ_FAILED", message: "Could not read existing products" } },
    };
  }
  const previousByExternal = new Map(
    (previousRows ?? []).map((row) => [row.external_id as string, row]),
  );
  const savedByExternal = new Map<string, string>();
  const records = page.products.nodes.map((product) => ({
    product,
    mapped: mapShopifyProduct(product, workspaceId, store.id),
  }));
  const changed = records.filter(
    ({ product, mapped }) =>
      previousByExternal.get(product.id)?.content_hash !== mapped.row.content_hash,
  );
  if (changed.length) {
    const { data, error } = await supabase
      .from("products")
      .upsert(
        changed.map(({ mapped }) => mapped.row),
        { onConflict: "store_id,external_id" },
      )
      .select("id,external_id");
    if (!error)
      for (const row of data ?? [])
        savedByExternal.set(row.external_id as string, row.id as string);
  }
  for (const { product, mapped } of records) {
    const previous = previousByExternal.get(product.id);
    const unchanged = previous?.content_hash === mapped.row.content_hash;
    let productId = unchanged
      ? (previous?.id as string | undefined)
      : savedByExternal.get(product.id);
    let itemError: string | undefined;
    if (!productId && !unchanged) {
      const { data, error } = await supabase
        .from("products")
        .upsert(mapped.row, { onConflict: "store_id,external_id" })
        .select("id")
        .single();
      if (error || !data) itemError = "Could not save product";
      else productId = data.id as string;
    }
    if (productId && mapped.images.length) {
      const images = mapped.images.map((image) => ({ ...image, product_id: productId }));
      const { error } = await supabase
        .from("product_images")
        .upsert(images, { onConflict: "product_id,url" });
      if (error) itemError = "Could not save product images";
    }
    if (itemError || !productId) {
      progress.failed += 1;
      itemResults.push({
        item_key: product.id,
        status: "failed",
        error: { message: itemError ?? "Product was not saved" },
      });
    } else {
      progress.completed += 1;
      if (unchanged) progress.skipped += 1;
      else if (previous) progress.updated += 1;
      else progress.created += 1;
      itemResults.push({ item_key: product.id, status: "succeeded", result: { unchanged } });
    }
  }
  const complete = !page.products.pageInfo.hasNextPage;
  const { data: savedJob, error: checkpointError } = await supabase.rpc("checkpoint_batch_job", {
    target_job: job.id,
    worker_token: workerToken,
    next_cursor: { after: page.products.pageInfo.endCursor },
    next_progress: progress,
    next_status: complete ? "completed" : "queued",
    item_results: itemResults,
  });
  if (checkpointError)
    return {
      status: 500,
      body: {
        error: {
          code: "JOB_CHECKPOINT_FAILED",
          message: "Import progress could not be saved; retry the job",
        },
      },
    };
  return { status: complete ? 200 : 202, body: { job: savedJob } };
}
