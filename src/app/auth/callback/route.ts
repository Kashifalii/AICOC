import { NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const supabase = await createSessionClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const requestedNext = url.searchParams.get("next");
        const next =
          requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
        return NextResponse.redirect(new URL(next, url.origin));
      }
    } catch {
      // Redirect below with a stable, user-facing error.
    }
  }
  return NextResponse.redirect(new URL("/sign-in?error=auth_callback", url.origin));
}
