import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const selectSchema = z.object({ workspaceId: z.string().uuid() }).strict();

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET() {
  try {
    const { supabase, user, workspaceId } = await getAuthenticatedWorkspace();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in to view your workspaces", 401);
    const { data: memberships, error: membershipError } = await supabase
      .from("workspace_members")
      .select("workspace_id,role,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (membershipError)
      return apiError("WORKSPACES_UNAVAILABLE", "Could not load memberships", 500);
    const workspaceIds = (memberships ?? []).map((membership) => membership.workspace_id as string);
    const { data: workspaces, error: workspaceError } = workspaceIds.length
      ? await supabase.from("workspaces").select("id,name,plan").in("id", workspaceIds)
      : { data: [], error: null };
    if (workspaceError) return apiError("WORKSPACES_UNAVAILABLE", "Could not load workspaces", 500);
    const workspaceById = new Map((workspaces ?? []).map((workspace) => [workspace.id, workspace]));
    return NextResponse.json({
      activeWorkspaceId: workspaceId,
      workspaces: (memberships ?? []).flatMap((membership) => {
        const workspace = workspaceById.get(membership.workspace_id);
        return workspace ? [{ ...workspace, role: membership.role }] : [];
      }),
    });
  } catch {
    return apiError("AUTH_UNAVAILABLE", "Workspace selection requires Supabase Auth", 503);
  }
}

export async function POST(request: Request) {
  const parsed = selectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", "Choose a valid workspace", 400);
  try {
    const { supabase, user } = await getAuthenticatedWorkspace();
    if (!user) return apiError("UNAUTHENTICATED", "Sign in to change workspaces", 401);
    const { data: membership, error } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", parsed.data.workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return apiError("WORKSPACE_READ_FAILED", "Could not verify workspace access", 500);
    if (!membership) return apiError("FORBIDDEN", "You are not a member of that workspace", 403);
    const cookieStore = await cookies();
    cookieStore.set("active_workspace_id", membership.workspace_id, {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return NextResponse.json({ activeWorkspaceId: membership.workspace_id });
  } catch {
    return apiError("AUTH_UNAVAILABLE", "Workspace selection requires Supabase Auth", 503);
  }
}
