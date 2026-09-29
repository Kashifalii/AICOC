import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { env } from "@/config/env";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/security/crypto";
import { validShopDomain, verifyShopifyHmac } from "@/lib/shopify/oauth";

const tokenSchema = z.object({ access_token: z.string().min(1), scope: z.string().optional() });
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const shop = params.get("shop") ?? "";
  const state = params.get("state") ?? "";
  const timestamp = Number(params.get("timestamp"));
  const storeCookies = await cookies();
  const savedState = storeCookies.get("shopify_oauth_state")?.value;
  const { user, workspaceId, role } = await getAuthenticatedWorkspace();
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
  if (!user || !workspaceId) return finish("UNAUTHENTICATED", 401);
  if (role !== "Owner") return finish("FORBIDDEN", 403);
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
    const admin = createAdminClient();
    const { error } = await admin.from("stores").upsert(
      {
        workspace_id: workspaceId,
        name: shop.replace(".myshopify.com", ""),
        type: "shopify",
        domain: shop,
        token_encrypted: encryptSecret(token.data.access_token),
        api_version: env.SHOPIFY_API_VERSION,
      },
      { onConflict: "workspace_id,domain" },
    );
    if (error) return finish("STORE_SAVE_FAILED", 500);
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete("shopify_oauth_state");
    return response;
  } catch {
    return finish("SHOPIFY_CONNECTION_FAILED", 502);
  }
}
