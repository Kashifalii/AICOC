import { NextResponse } from "next/server";
import { z } from "zod";
import { demoProducts } from "@/data/demo-products";
import { toDemoProductRow } from "@/lib/jobs/demo-products";
import { getBatchWindow } from "@/lib/jobs/batch";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const batchSize = 10;
const paramsSchema = z.object({ jobId: z.string().uuid() });

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) return apiError("INVALID_INPUT", "Invalid job id", 400);

  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId) return apiError("UNAUTHENTICATED", "Sign in to run this job", 401);
    if (role !== "Owner" && role !== "Editor")
      return apiError("FORBIDDEN", "Editor access is required", 403);

    const { data: jobRow, error: jobReadError } = await supabase
      .from("jobs")
      .select(
        "id,workspace_id,type,store_id,cursor,progress,status,total_items,completed_items,failed_items",
      )
      .eq("id", parsedParams.data.jobId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (jobReadError) return apiError("JOB_READ_FAILED", "Could not load the job", 500);
    if (!jobRow) return apiError("JOB_NOT_FOUND", "Job not found", 404);
    if (jobRow.status === "completed") return NextResponse.json({ job: jobRow });
    if (jobRow.type !== "demo_seed")
      return apiError("UNSUPPORTED_JOB", "This job type is not available", 400);
    if (!jobRow.store_id) return apiError("JOB_INVALID", "The import job has no store", 409);

    const workerToken = crypto.randomUUID();
    const { data: claimData, error: claimError } = await supabase.rpc("claim_batch_job", {
      target_job: jobRow.id,
      worker_token: workerToken,
      lease_seconds: 90,
    });
    if (claimError)
      return apiError("JOB_CLAIM_FAILED", "Could not claim the next import batch", 409);
    const claimed = Array.isArray(claimData) ? claimData[0] : claimData;
    if (!claimed) return NextResponse.json({ job: jobRow, busy: true }, { status: 202 });

    const cursor = z
      .object({ offset: z.number().int().nonnegative().default(0) })
      .parse(claimed.cursor ?? {});
    const priorProgress = z
      .object({
        completed: z.number().int().nonnegative().default(0),
        failed: z.number().int().nonnegative().default(0),
        created: z.number().int().nonnegative().default(0),
        updated: z.number().int().nonnegative().default(0),
        skipped: z.number().int().nonnegative().default(0),
      })
      .parse(claimed.progress ?? {});
    const window = getBatchWindow(cursor.offset, demoProducts.length, batchSize);
    const batch = demoProducts.slice(window.start, window.end);
    const progress = { ...priorProgress };
    const itemResults: {
      item_key: string;
      status: "succeeded" | "failed";
      result?: object;
      error?: object;
    }[] = [];

    if (batch.length > 0) {
      const externalIds = batch.map((product) => product.id);
      const { data: existingRows, error: existingError } = await supabase
        .from("products")
        .select("id,external_id,content_hash")
        .eq("workspace_id", workspaceId)
        .eq("store_id", claimed.store_id)
        .in("external_id", externalIds);
      if (existingError) {
        await supabase.rpc("checkpoint_batch_job", {
          target_job: claimed.id,
          worker_token: workerToken,
          next_cursor: claimed.cursor,
          next_progress: priorProgress,
          next_status: "queued",
          item_results: [],
        });
        return apiError("PRODUCT_READ_FAILED", "Could not resume product import", 500);
      }
      const oldByExternalId = new Map(
        (existingRows ?? []).map((row) => [row.external_id as string, row]),
      );
      const rowsToSave = batch
        .filter(
          (product) =>
            oldByExternalId.get(product.id)?.content_hash !==
            toDemoProductRow(product, workspaceId, claimed.store_id).content_hash,
        )
        .map((product) => toDemoProductRow(product, workspaceId, claimed.store_id));
      const saveResult = rowsToSave.length
        ? await supabase
            .from("products")
            .upsert(rowsToSave, { onConflict: "store_id,external_id" })
            .select("id,external_id")
        : { data: [], error: null };

      let savedRows = saveResult.data ?? [];
      const saveErrors = new Map<string, string>();
      if (saveResult.error) {
        savedRows = [];
        for (const row of rowsToSave) {
          const { data: saved, error } = await supabase
            .from("products")
            .upsert(row, { onConflict: "store_id,external_id" })
            .select("id,external_id")
            .single();
          if (error) saveErrors.set(row.external_id, error.message);
          else if (saved) savedRows.push(saved);
        }
      }
      const savedByExternalId = new Map(
        savedRows.map((row) => [row.external_id as string, row.id as string]),
      );

      for (const product of batch) {
        const previous = oldByExternalId.get(product.id);
        const unchanged =
          previous?.content_hash ===
          toDemoProductRow(product, workspaceId, claimed.store_id).content_hash;
        const productId = savedByExternalId.get(product.id) ?? (previous?.id as string | undefined);
        let errorMessage = saveErrors.get(product.id);
        if (!productId && !errorMessage) errorMessage = "Product was not saved";
        if (productId && !errorMessage) {
          const images = product.images.map((image, position) => ({
            workspace_id: workspaceId,
            product_id: productId,
            url: image.url,
            alt: image.alt,
            position,
          }));
          if (images.length) {
            const { error } = await supabase
              .from("product_images")
              .upsert(images, { onConflict: "product_id,url" });
            if (error) errorMessage = error.message;
          }
        }
        if (errorMessage) {
          progress.failed += 1;
          itemResults.push({
            item_key: product.id,
            status: "failed",
            error: { message: errorMessage },
          });
        } else {
          progress.completed += 1;
          if (unchanged) progress.skipped += 1;
          else if (previous) progress.updated += 1;
          else progress.created += 1;
          itemResults.push({ item_key: product.id, status: "succeeded", result: { unchanged } });
        }
      }
    }

    const nextOffset = window.next;
    const status = window.complete ? "completed" : "queued";
    const { data: savedJob, error: checkpointError } = await supabase.rpc("checkpoint_batch_job", {
      target_job: claimed.id,
      worker_token: workerToken,
      next_cursor: { offset: nextOffset },
      next_progress: progress,
      next_status: status,
      item_results: itemResults,
    });
    if (checkpointError)
      return apiError(
        "JOB_CHECKPOINT_FAILED",
        "The batch result could not be saved; retry the job",
        500,
      );
    return NextResponse.json({ job: savedJob }, { status: status === "completed" ? 200 : 202 });
  } catch {
    return apiError("JOB_FAILED", "The batch could not be processed", 500);
  }
}
