import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { env } from "@/config/env";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/security/crypto";
import { validShopDomain, verifyShopifyHmac } from "@/lib/shopify/oauth";
import { roleCan } from "@/lib/authz/roles";

const tokenSchema = z.object({ access_token: z.string().min(1), scope: z.string().optional() });
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const shop = params.get("shop") ?? "";
  const state = params.get("state") ?? "";
  const timestamp = Number(params.get("timestamp"));
  const storeCookies = await cookies();
  const savedState = storeCookies.get("shopify_oauth_state")?.value;
  const finish = (target: string, status: number) => {
    const response =
      status === 302
        ? NextResponse.redirect(target)
        : NextResponse.json(
            { error: { code: target, message: "Shopify authorization could not be completed." } },
            { status },
          );
    response.cookies.delete("shopify_oauth_state");
    return response;
  };
  let auth: Awaited<ReturnType<typeof getAuthenticatedWorkspace>>;
  try {
    auth = await getAuthenticatedWorkspace();
  } catch {
    return finish("AUTH_UNAVAILABLE", 503);
  }
  const { user, workspaceId, role } = auth;
  if (!user || !workspaceId) return finish("UNAUTHENTICATED", 401);
  if (!roleCan(role, "store:connect")) return finish("FORBIDDEN", 403);
  if (!env.SHOPIFY_API_SECRET || !env.SHOPIFY_API_KEY || !validShopDomain(shop))
    return finish("SHOPIFY_NOT_CONFIGURED", 503);
  if (!savedState || !state || savedState !== state) return finish("INVALID_OAUTH_STATE", 400);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > 300 ||
    !verifyShopifyHmac(params, env.SHOPIFY_API_SECRET)
  )
    return finish("INVALID_SHOPIFY_SIGNATURE", 400);
  const code = params.get("code");
  if (!code) return finish("MISSING_AUTH_CODE", 400);
  try {
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: env.SHOPIFY_API_KEY,
        client_secret: env.SHOPIFY_API_SECRET,
        code,
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) return finish("SHOPIFY_TOKEN_EXCHANGE_FAILED", 502);
    const token = tokenSchema.safeParse(await tokenResponse.json());
    if (!token.success) return finish("INVALID_SHOPIFY_TOKEN_RESPONSE", 502);
    const grantedScopes = new Set((token.data.scope ?? "").split(",").map((scope) => scope.trim()));
    if (!grantedScopes.has("read_products") || !grantedScopes.has("write_products"))
      return finish("SHOPIFY_SCOPES_MISSING", 403);
    const admin = createAdminClient();
    const storeValues = {
      workspace_id: workspaceId,
      name: shop.replace(".myshopify.com", ""),
      type: "shopify",
      domain: shop,
      token_encrypted: encryptSecret(token.data.access_token),
      api_version: env.SHOPIFY_API_VERSION,
    };
    const { data: existingStore, error: lookupError } = await admin
      .from("stores")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("domain", shop)
      .maybeSingle();
    if (lookupError) return finish("STORE_LOOKUP_FAILED", 500);
    const { error } = existingStore
      ? await admin.from("stores").update(storeValues).eq("id", existingStore.id)
      : await admin.from("stores").insert(storeValues);
    if (error) return finish("STORE_SAVE_FAILED", 500);
    const response = NextResponse.redirect(new URL("/?shopify=connected", request.url));
    response.cookies.delete("shopify_oauth_state");
    return response;
  } catch {
    return finish("SHOPIFY_CONNECTION_FAILED", 502);
  }
}
