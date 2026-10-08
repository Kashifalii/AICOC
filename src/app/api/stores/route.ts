import { NextResponse } from "next/server";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to load stores." } },
        { status: 401 },
      );
    if (!role)
      return NextResponse.json(
        {
          error: {
            code: "WORKSPACE_REQUIRED",
            message: "Your account is not assigned to a workspace.",
          },
        },
        { status: 403 },
      );

    const { data, error } = await supabase
      .from("stores")
      .select("id,name,type,domain,created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    if (error)
      return NextResponse.json(
        { error: { code: "STORE_READ_FAILED", message: "Could not load connected stores." } },
        { status: 500 },
      );
    return NextResponse.json({ stores: data ?? [], workspaceId, role });
  } catch {
    return NextResponse.json(
      { error: { code: "STORE_UNAVAILABLE", message: "Store access requires Supabase Auth." } },
      { status: 503 },
    );
  }
}
