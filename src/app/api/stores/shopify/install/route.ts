import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/config/env";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";
import { createOAuthState, validShopDomain } from "@/lib/shopify/oauth";
import { roleCan } from "@/lib/authz/roles";
import { hasValidEncryptionKey } from "@/lib/security/crypto";

export async function GET(request: Request) {
  let context: Awaited<ReturnType<typeof getAuthenticatedWorkspace>>;
  try {
    context = await getAuthenticatedWorkspace();
  } catch {
    return NextResponse.json(
      {
        error: { code: "AUTH_UNAVAILABLE", message: "Shopify connection requires Supabase Auth." },
      },
      { status: 503 },
    );
  }
  const { user, role } = context;
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
  if (!env.SHOPIFY_API_KEY || !env.SHOPIFY_API_SECRET)
    return NextResponse.json(
      {
        error: {
          code: "SHOPIFY_NOT_CONFIGURED",
          message: "Configure the Shopify app key and secret.",
        },
      },
      { status: 503 },
    );
  if (!hasValidEncryptionKey())
    return NextResponse.json(
      {
        error: {
          code: "SHOPIFY_ENCRYPTION_NOT_CONFIGURED",
          message: "Set ENCRYPTION_KEY to a base64-encoded 32-byte key before connecting Shopify.",
        },
      },
      { status: 503 },
    );
  const state = createOAuthState();
  (await cookies()).set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", env.SHOPIFY_API_KEY);
  const scopes = new Set(
    env.SHOPIFY_SCOPES.split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
  scopes.add("read_products");
  scopes.add("write_products");
  authorize.searchParams.set("scope", [...scopes].join(","));
  authorize.searchParams.set(
    "redirect_uri",
    new URL("/api/stores/shopify/callback", request.url).toString(),
  );
  authorize.searchParams.set("state", state);
  return NextResponse.redirect(authorize);
}
