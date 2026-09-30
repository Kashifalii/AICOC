import { NextResponse } from "next/server";
import { z } from "zod";
import { roleCan } from "@/lib/authz/roles";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const paramsSchema = z.object({ storeId: z.string().uuid() });
const bodySchema = z.object({ idempotencyKey: z.string().uuid() }).strict();

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ storeId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success)
    return apiError("INVALID_INPUT", "Invalid Shopify import request", 400);
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return apiError("UNAUTHENTICATED", "Sign in to import a catalog", 401);
    if (!roleCan(role, "store:import"))
      return apiError("FORBIDDEN", "Editor access is required to import a catalog", 403);
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id")
      .eq("id", params.data.storeId)
      .eq("workspace_id", workspaceId)
      .eq("type", "shopify")
      .maybeSingle();
    if (storeError || !store)
      return apiError("STORE_NOT_FOUND", "Shopify store is unavailable", 404);
    const idempotencyKey = `shopify-import:${store.id}:${body.data.idempotencyKey}`;
    const { data: existing, error: existingError } = await supabase
      .from("jobs")
      .select("id,status,total_items,completed_items,failed_items")
      .eq("workspace_id", workspaceId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) return apiError("JOB_READ_FAILED", "Could not check import progress", 500);
    if (existing) return NextResponse.json({ job: existing });
    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        workspace_id: workspaceId,
        store_id: store.id,
        type: "shopify_import",
        status: "queued",
        cursor: { after: null },
        progress: { completed: 0, failed: 0, created: 0, updated: 0, skipped: 0, total: 0 },
        total_items: 0,
        idempotency_key: idempotencyKey,
        payload: { source: "shopify-admin-graphql" },
      })
      .select("id,status,total_items,completed_items,failed_items")
      .single();
    if (error || !job) return apiError("JOB_CREATE_FAILED", "Could not start the import", 500);
    return NextResponse.json({ job }, { status: 202 });
  } catch {
    return apiError("PERSISTENCE_UNAVAILABLE", "Shopify import requires Supabase", 503);
  }
}
