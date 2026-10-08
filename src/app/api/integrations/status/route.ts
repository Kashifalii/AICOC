import { NextResponse } from "next/server";
import { env, isGeminiConfigured, isSupabaseConfigured } from "@/config/env";
import { hasValidEncryptionKey } from "@/lib/security/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  let persistedJobsSchemaReady = false;
  if (isSupabaseConfigured) {
    try {
      const admin = createAdminClient();
      const [jobs, jobItems, productFields] = await Promise.all([
        admin
          .from("jobs")
          .select(
            "store_id,total_items,completed_items,failed_items,locked_by,locked_until,updated_at,payload",
          )
          .limit(0),
        admin.from("job_items").select("id,job_id,item_key,status").limit(0),
        admin.from("products").select("vendor,metafields").limit(0),
      ]);
      persistedJobsSchemaReady = !jobs.error && !jobItems.error && !productFields.error;
    } catch {
      persistedJobsSchemaReady = false;
    }
  }
  return NextResponse.json({
    supabaseConfigured: isSupabaseConfigured,
    persistedJobsSchemaReady,
    geminiConfigured: isGeminiConfigured,
    shopifyConfigured: Boolean(env.SHOPIFY_API_KEY && env.SHOPIFY_API_SECRET),
    shopifyEncryptionConfigured: hasValidEncryptionKey(),
    shopifyScopes: env.SHOPIFY_SCOPES.split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    shopifyWriteScopeConfigured: env.SHOPIFY_SCOPES.split(",")
      .map((scope) => scope.trim())
      .includes("write_products"),
  });
}
