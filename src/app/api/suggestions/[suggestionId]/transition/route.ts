import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";
import { roleCan } from "@/lib/authz/roles";

const paramsSchema = z.object({ suggestionId: z.string().uuid() });
const requestSchema = z
  .object({ status: z.enum(["pending_review", "approved", "rejected"]) })
  .strict();

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ suggestionId: string }> },
) {
  const params = paramsSchema.safeParse(await context.params);
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success)
    return apiError("INVALID_INPUT", "Invalid suggestion transition", 400);
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return apiError("UNAUTHENTICATED", "Sign in to change suggestion status", 401);
    const actionByStatus = {
      pending_review: "suggestion:edit",
      approved: "suggestion:approve",
      rejected: "suggestion:reject",
    } as const;
    if (!roleCan(role, actionByStatus[body.data.status]))
      return apiError("FORBIDDEN", "Your workspace role cannot perform this transition", 403);
    const { data, error } = await supabase.rpc("transition_suggestion", {
      target_id: params.data.suggestionId,
      target_status: body.data.status,
    });
    if (error)
      return apiError("TRANSITION_REJECTED", "The suggestion state transition is not allowed", 409);
    return NextResponse.json({ id: params.data.suggestionId, status: data });
  } catch {
    return apiError("AUTH_UNAVAILABLE", "Suggestion review requires Supabase Auth", 503);
  }
}
