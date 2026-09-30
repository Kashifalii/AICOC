import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/config/env";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";
import { createOAuthState, validShopDomain } from "@/lib/shopify/oauth";
import { roleCan } from "@/lib/authz/roles";

export async function GET(request: Request) {
  const { user, role } = await getAuthenticatedWorkspace();
  if (!user)
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in before connecting a store." } },
      { status: 401 },
    );
  if (!roleCan(role, "store:connect"))
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Only a workspace Owner may connect a Shopify store.",
        },
      },
      { status: 403 },
    );
  const shop = new URL(request.url).searchParams.get("shop") ?? "";
  if (!validShopDomain(shop))
    return NextResponse.json(
      { error: { code: "INVALID_SHOP", message: "Enter a valid myshopify.com store domain." } },
      { status: 400 },
    );
  if (!env.SHOPIFY_API_KEY || !env.NEXT_PUBLIC_APP_URL)
    return NextResponse.json(
      {
        error: {
          code: "SHOPIFY_NOT_CONFIGURED",
          message: "Configure the Shopify app key and application URL.",
        },
      },
      { status: 503 },
    );
  const state = createOAuthState();
  (await cookies()).set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: new URL(env.NEXT_PUBLIC_APP_URL).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", env.SHOPIFY_API_KEY);
  authorize.searchParams.set("scope", "read_products");
  authorize.searchParams.set(
    "redirect_uri",
    `${env.NEXT_PUBLIC_APP_URL}/api/stores/shopify/callback`,
  );
  authorize.searchParams.set("state", state);
  return NextResponse.redirect(authorize);
}
