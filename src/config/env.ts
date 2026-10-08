import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));
const schema = z.object({
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_API_SECRET: z.string().optional(),
  SHOPIFY_SCOPES: z.string().default("read_products,write_products"),
  SHOPIFY_API_VERSION: z.string().default("2026-04"),
  ENCRYPTION_KEY: z.string().optional(),
  AI_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
  AI_DAILY_LIMIT_PER_WORKSPACE: z.coerce.number().int().positive().default(200),
});

export const env = schema.parse(process.env);
export const isSupabaseConfigured = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL &&
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  env.SUPABASE_SERVICE_ROLE_KEY,
);
export const isGeminiConfigured = Boolean(env.GEMINI_API_KEY);
