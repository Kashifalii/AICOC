import { NextResponse } from "next/server";
import { z } from "zod";
import { roleCan } from "@/lib/authz/roles";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const paramsSchema = z.object({ suggestionId: z.string().uuid() });
const bodySchema = z.object({ suggestedValue: z.string().min(1).max(10000) }).strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ suggestionId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success)
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Suggestion data is invalid" } },
      { status: 400 },
    );
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to edit this suggestion" } },
        { status: 401 },
      );
    if (!roleCan(role, "suggestion:edit"))
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Editor access is required" } },
        { status: 403 },
      );
    const { data, error } = await supabase
      .from("suggestions")
      .update({ suggested_value: body.data.suggestedValue })
      .eq("id", params.data.suggestionId)
      .eq("workspace_id", workspaceId)
      .eq("status", "draft")
      .select("id,status")
      .maybeSingle();
    if (error)
      return NextResponse.json(
        { error: { code: "SUGGESTION_UPDATE_FAILED", message: "Could not save the draft value" } },
        { status: 500 },
      );
    if (!data)
      return NextResponse.json(
        { error: { code: "DRAFT_NOT_EDITABLE", message: "Only a draft suggestion can be edited" } },
        { status: 409 },
      );
    return NextResponse.json({ suggestion: data });
  } catch {
    return NextResponse.json(
      {
        error: { code: "PERSISTENCE_UNAVAILABLE", message: "Suggestion editing requires Supabase" },
      },
      { status: 503 },
    );
  }
}
