import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/config/env";
import { z } from "zod";
import type { WorkspaceRole } from "@/lib/authz/roles";

export async function createSessionClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    throw new Error("Supabase URL and public anon key are required for sign-in");
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        for (const { name, value, options } of values) cookieStore.set(name, value, options);
      },
    },
  });
}

export async function getAuthenticatedWorkspace() {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, workspaceId: null, role: null };
  const cookieStore = await cookies();
  const preferredWorkspace = z
    .string()
    .uuid()
    .safeParse(cookieStore.get("active_workspace_id")?.value);
  if (preferredWorkspace.success) {
    const { data: preferredMember, error: preferredError } = await supabase
      .from("workspace_members")
      .select("workspace_id,role")
      .eq("user_id", user.id)
      .eq("workspace_id", preferredWorkspace.data)
      .maybeSingle();
    if (!preferredError && preferredMember)
      return {
        supabase,
        user,
        workspaceId: preferredMember.workspace_id as string,
        role: preferredMember.role as WorkspaceRole,
      };
  }
  const { data: member, error } = await supabase
    .from("workspace_members")
    .select("workspace_id,role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !member) return { supabase, user, workspaceId: null, role: null };
  return {
    supabase,
    user,
    workspaceId: member.workspace_id as string,
    role: member.role as WorkspaceRole,
  };
}
