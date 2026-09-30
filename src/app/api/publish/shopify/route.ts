import { NextResponse } from "next/server";
import { z } from "zod";
import { roleCan } from "@/lib/authz/roles";
import { env } from "@/config/env";
import { decryptSecret } from "@/lib/security/crypto";
import { updateShopifyProduct } from "@/lib/shopify/graphql";
import { validShopDomain } from "@/lib/shopify/oauth";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const inputSchema = z
  .object({
    storeId: z.string().uuid(),
    suggestionIds: z.array(z.string().uuid()).min(1).max(10),
  })
  .strict();

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
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
      return apiError("FORBIDDEN", "Only a workspace Owner may publish to Shopify", 403);
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id,domain,token_encrypted,api_version")
      .eq("id", input.data.storeId)
      .eq("workspace_id", workspaceId)
      .eq("type", "shopify")
      .maybeSingle();
    if (storeError || !store)
      return apiError("STORE_NOT_FOUND", "Shopify store is unavailable", 404);
    if (!validShopDomain(store.domain ?? "") || !store.token_encrypted)
      return apiError("STORE_NOT_CONNECTED", "Shopify credentials are unavailable", 409);
    const { data: suggestions, error: suggestionError } = await supabase
      .from("suggestions")
      .select("id,product_id,field,current_value,suggested_value,status")
      .eq("workspace_id", workspaceId)
      .in("id", input.data.suggestionIds);
    if (suggestionError)
      return apiError("SUGGESTION_READ_FAILED", "Could not load approved changes", 500);
    if (
      suggestions?.length !== input.data.suggestionIds.length ||
      suggestions.some((item) => item.status !== "approved")
    )
      return apiError("APPROVAL_REQUIRED", "Every published change must be approved", 409);
    const productIds = [...new Set((suggestions ?? []).map((item) => item.product_id as string))];
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id,store_id,external_id")
      .eq("workspace_id", workspaceId)
      .eq("store_id", store.id)
      .in("id", productIds);
    if (productError || products?.length !== productIds.length)
      return apiError(
        "PRODUCT_STORE_MISMATCH",
        "Changes must belong to the selected Shopify store",
        409,
      );
    const productById = new Map((products ?? []).map((product) => [product.id as string, product]));
    let token: string;
    try {
      token = decryptSecret(store.token_encrypted);
    } catch {
      return apiError("TOKEN_DECRYPTION_FAILED", "Reconnect the Shopify store to continue", 503);
    }
    const { data: batch, error: batchError } = await supabase
      .from("publish_batches")
      .insert({ workspace_id: workspaceId, store_id: store.id, mode: "shopify", status: "running" })
      .select("id")
      .single();
    if (batchError || !batch)
      return apiError("PUBLISH_BATCH_FAILED", "Could not create the publish batch", 500);

    const results: unknown[] = [];
    for (const suggestion of suggestions ?? []) {
      const product = productById.get(suggestion.product_id as string);
      if (!product?.external_id?.startsWith("gid://shopify/Product/")) {
        await supabase.from("publish_batches").update({ status: "failed" }).eq("id", batch.id);
        return NextResponse.json(
          {
            error: {
              code: "SHOPIFY_PRODUCT_ID_MISSING",
              message: "Product needs a Shopify import before publishing.",
            },
            batchId: batch.id,
            completed: results,
          },
          { status: 409 },
        );
      }
      try {
        await updateShopifyProduct(
          store.domain,
          token,
          store.api_version ?? env.SHOPIFY_API_VERSION,
          product.external_id,
          suggestion.field,
          suggestion.suggested_value,
        );
      } catch (error) {
        await supabase.from("publish_batches").update({ status: "failed" }).eq("id", batch.id);
        return NextResponse.json(
          {
            error: {
              code: "SHOPIFY_UPDATE_FAILED",
              message: error instanceof Error ? error.message : "Shopify update failed",
            },
            batchId: batch.id,
            completed: results,
          },
          { status: 502 },
        );
      }
      const { data, error } = await supabase.rpc("apply_approved_suggestion", {
        target_suggestion: suggestion.id,
        target_batch: batch.id,
      });
      if (error) {
        await supabase.from("publish_batches").update({ status: "failed" }).eq("id", batch.id);
        return NextResponse.json(
          {
            error: {
              code: "PUBLISH_SNAPSHOT_FAILED",
              message: "Shopify was updated but the local publish snapshot could not be saved.",
            },
            batchId: batch.id,
            completed: results,
          },
          { status: 500 },
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
        "Changes were applied but batch status was not saved",
        500,
      );
    return NextResponse.json({ batchId: batch.id, results });
  } catch {
    return apiError(
      "PUBLISH_UNAVAILABLE",
      "Shopify publishing requires database configuration",
      503,
    );
  }
}
