import { NextResponse } from "next/server";
import { z } from "zod";
import { roleCan } from "@/lib/authz/roles";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const inputSchema = z
  .object({
    productId: z.string().uuid(),
    issueId: z.string().uuid().optional(),
    field: z.enum(["title", "description", "seoTitle", "seoDescription", "images.alt"]),
    currentValue: z.string().max(10000),
    suggestedValue: z.string().min(1).max(10000),
  })
  .strict();

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return apiError("INVALID_INPUT", "Suggestion data is invalid", 400);
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return apiError("UNAUTHENTICATED", "Sign in to save a suggestion", 401);
    if (!roleCan(role, "suggestion:edit"))
      return apiError("FORBIDDEN", "Editor access is required to save a suggestion", 403);
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", input.data.productId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (productError) return apiError("PRODUCT_READ_FAILED", "Could not verify the product", 500);
    if (!product)
      return apiError("PRODUCT_NOT_FOUND", "Product is unavailable in this workspace", 404);
    if (input.data.issueId) {
      const { data: issue, error: issueError } = await supabase
        .from("audit_issues")
        .select("id")
        .eq("id", input.data.issueId)
        .eq("product_id", product.id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (issueError)
        return apiError("ISSUE_READ_FAILED", "Could not verify the audit finding", 500);
      if (!issue) return apiError("ISSUE_NOT_FOUND", "Audit finding is not available", 404);
    }
    const { data, error } = await supabase
      .from("suggestions")
      .insert({
        workspace_id: workspaceId,
        issue_id: input.data.issueId ?? null,
        product_id: product.id,
        field: input.data.field,
        current_value: input.data.currentValue,
        suggested_value: input.data.suggestedValue,
        status: "draft",
      })
      .select("id,status")
      .single();
    if (error) return apiError("SUGGESTION_SAVE_FAILED", "Could not save the draft", 500);
    return NextResponse.json({ suggestion: data }, { status: 201 });
  } catch {
    return apiError("PERSISTENCE_UNAVAILABLE", "Suggestion saving requires Supabase", 503);
  }
}

export async function GET(request: Request) {
  const storeId = new URL(request.url).searchParams.get("storeId");
  const parsedStoreId = z.string().uuid().safeParse(storeId);
  if (!parsedStoreId.success) return apiError("INVALID_INPUT", "A valid store id is required", 400);
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return apiError("UNAUTHENTICATED", "Sign in to load saved suggestions", 401);
    if (!roleCan(role, "suggestion:read"))
      return apiError("FORBIDDEN", "Your workspace role cannot view suggestions", 403);
    const { data, error } = await supabase
      .from("suggestions")
      .select(
        "id,issue_id,product_id,field,current_value,suggested_value,status,created_at,products!inner(store_id)",
      )
      .eq("workspace_id", workspaceId)
      .eq("products.store_id", parsedStoreId.data)
      .order("created_at", { ascending: false });
    if (error) return apiError("SUGGESTION_READ_FAILED", "Could not load saved suggestions", 500);
    return NextResponse.json({ suggestions: data ?? [] });
  } catch {
    return apiError("PERSISTENCE_UNAVAILABLE", "Loading suggestions requires Supabase", 503);
  }
}
