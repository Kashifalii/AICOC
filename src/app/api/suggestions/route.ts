import { NextResponse } from "next/server";
import { z } from "zod";
import { roleCan } from "@/lib/authz/roles";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const inputSchema = z
  .object({
    productId: z.string().uuid(),
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
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", input.data.productId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!product)
      return apiError("PRODUCT_NOT_FOUND", "Product is unavailable in this workspace", 404);
    const { data, error } = await supabase
      .from("suggestions")
      .insert({
        workspace_id: workspaceId,
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
