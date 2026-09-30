import { NextResponse } from "next/server";
import { z } from "zod";
import { roleCan } from "@/lib/authz/roles";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const requestSchema = z
  .object({ suggestionIds: z.array(z.string().uuid()).min(1).max(10) })
  .strict();

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (
    !input.success ||
    new Set(input.data?.suggestionIds).size !== input.data?.suggestionIds.length
  )
    return apiError("INVALID_INPUT", "Select up to ten unique approved changes", 400);
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return apiError("UNAUTHENTICATED", "Sign in to publish changes", 401);
    if (!roleCan(role, "publish:create"))
      return apiError("FORBIDDEN", "Only a workspace Owner may publish changes", 403);
    const { data: approved, error: readError } = await supabase
      .from("suggestions")
      .select("id,status,product_id")
      .eq("workspace_id", workspaceId)
      .in("id", input.data.suggestionIds);
    if (readError)
      return apiError("SUGGESTION_READ_FAILED", "Could not verify approved changes", 500);
    if (
      approved?.length !== input.data.suggestionIds.length ||
      approved.some((item) => item.status !== "approved")
    )
      return apiError("APPROVAL_REQUIRED", "Every selected change must be approved", 409);
    const productIds = [...new Set((approved ?? []).map((item) => item.product_id as string))];
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id,store_id")
      .eq("workspace_id", workspaceId)
      .in("id", productIds);
    const storeIds = new Set((products ?? []).map((product) => product.store_id as string));
    if (productError || products?.length !== productIds.length || storeIds.size !== 1)
      return apiError("STORE_MISMATCH", "Select changes from one available store", 409);
    const [storeId] = storeIds;

    const { data: batch, error: batchError } = await supabase
      .from("publish_batches")
      .insert({
        workspace_id: workspaceId,
        store_id: storeId,
        mode: "simulated",
        status: "running",
      })
      .select("id")
      .single();
    if (batchError || !batch)
      return apiError("PUBLISH_BATCH_FAILED", "Could not create a simulated publish batch", 500);

    const results: unknown[] = [];
    for (const suggestionId of input.data.suggestionIds) {
      const { data, error } = await supabase.rpc("apply_approved_suggestion", {
        target_suggestion: suggestionId,
        target_batch: batch.id,
      });
      if (error) {
        await supabase
          .from("publish_batches")
          .update({ status: "failed" })
          .eq("id", batch.id)
          .eq("workspace_id", workspaceId);
        return NextResponse.json(
          {
            error: { code: "PUBLISH_ITEM_FAILED", message: "A change could not be applied." },
            batchId: batch.id,
            completed: results,
          },
          { status: 409 },
        );
      }
      results.push(data);
    }
    const { error: finishError } = await supabase
      .from("publish_batches")
      .update({ status: "completed" })
      .eq("id", batch.id)
      .eq("workspace_id", workspaceId);
    if (finishError)
      return apiError(
        "PUBLISH_FINALIZE_FAILED",
        "Changes were applied but the batch status was not saved",
        500,
      );
    return NextResponse.json({ batchId: batch.id, results });
  } catch {
    return apiError("PUBLISH_UNAVAILABLE", "Publishing requires Supabase persistence", 503);
  }
}
