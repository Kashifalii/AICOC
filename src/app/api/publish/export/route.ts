import { NextResponse } from "next/server";
import { z } from "zod";
import { roleCan } from "@/lib/authz/roles";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const requestSchema = z
  .object({ suggestionIds: z.array(z.string().uuid()).min(1).max(100) })
  .strict();
const escapeCsv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (
    !input.success ||
    new Set(input.data?.suggestionIds).size !== input.data?.suggestionIds.length
  )
    return apiError("INVALID_INPUT", "Select up to 100 unique approved changes", 400);
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId) return apiError("UNAUTHENTICATED", "Sign in to export changes", 401);
    if (!roleCan(role, "publish:export"))
      return apiError("FORBIDDEN", "Editor or Owner access is required to export", 403);
    const { data: suggestions, error: suggestionError } = await supabase
      .from("suggestions")
      .select("id,product_id,field,suggested_value,status")
      .eq("workspace_id", workspaceId)
      .in("id", input.data.suggestionIds);
    if (suggestionError)
      return apiError("SUGGESTION_READ_FAILED", "Could not load approved changes", 500);
    if (
      suggestions?.length !== input.data.suggestionIds.length ||
      suggestions.some((item) => item.status !== "approved")
    )
      return apiError("APPROVAL_REQUIRED", "Every exported change must be approved", 409);

    const productIds = [...new Set((suggestions ?? []).map((item) => item.product_id as string))];
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id,handle,title,description_html,seo_title,seo_description")
      .eq("workspace_id", workspaceId)
      .in("id", productIds);
    if (productError || products?.length !== productIds.length)
      return apiError("PRODUCT_READ_FAILED", "Could not read product details for export", 500);
    const byId = new Map((products ?? []).map((product) => [product.id as string, product]));
    const rows = new Map<string, Record<string, unknown>>();
    for (const suggestion of suggestions ?? []) {
      const product = byId.get(suggestion.product_id as string);
      if (!product) return apiError("PRODUCT_NOT_FOUND", "An approved product is unavailable", 404);
      const row: Record<string, unknown> = rows.get(suggestion.product_id as string) ?? {
        Handle: product.handle,
        Title: product.title,
        Description: product.description_html,
        "SEO Title": product.seo_title,
        "SEO Description": product.seo_description,
      };
      const fieldName: Record<string, string> = {
        title: "Title",
        description: "Description",
        seoTitle: "SEO Title",
        seoDescription: "SEO Description",
      };
      const column = fieldName[suggestion.field as string];
      if (!column)
        return apiError("FIELD_NOT_EXPORTABLE", "This suggestion field cannot be exported", 409);
      row[column] = suggestion.suggested_value;
      rows.set(suggestion.product_id as string, row);
    }
    const headers = ["Handle", "Title", "Description", "SEO Title", "SEO Description"];
    const csv = [
      headers.map(escapeCsv).join(","),
      ...[...rows.values()].map((row) => headers.map((key) => escapeCsv(row[key])).join(",")),
    ].join("\r\n");
    for (const suggestion of suggestions ?? []) {
      const { error } = await supabase.rpc("transition_suggestion", {
        target_id: suggestion.id,
        target_status: "exported",
      });
      if (error) return apiError("EXPORT_STATE_FAILED", "Could not save export status", 409);
    }
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="approved-product-changes.csv"',
        "cache-control": "no-store",
      },
    });
  } catch {
    return apiError("EXPORT_UNAVAILABLE", "Export requires Supabase persistence", 503);
  }
}
