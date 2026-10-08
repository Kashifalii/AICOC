import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { env, isGeminiConfigured } from "@/config/env";
import { aiSuggestionJsonSchema, suggestionSchema } from "@/lib/ai/schemas";
import { suggestionsPrompt, SUGGESTIONS_PROMPT_VERSION } from "@/lib/ai/prompts/suggestions-v1";
import { factLock } from "@/lib/ai/fact-lock";
import { sanitizeDescriptionHtml } from "@/lib/ai/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";
import { roleCan } from "@/lib/authz/roles";

const inputSchema = z.object({
  productId: z.string().uuid(),
  issueId: z.string().uuid().optional(),
  field: z.enum(["title", "seoTitle", "seoDescription", "description"]),
  currentValue: z.string().max(10000),
  title: z.string().max(300),
  description: z.string().max(10000),
  vendor: z.string().max(200),
  productType: z.string().max(100),
});
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Product data is invalid" } },
      { status: 400 },
    );
  let context: Awaited<ReturnType<typeof getAuthenticatedWorkspace>>;
  try {
    context = await getAuthenticatedWorkspace();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "AUTH_NOT_CONFIGURED",
          message: "Configure Supabase Auth to use AI suggestions.",
        },
      },
      { status: 503 },
    );
  }
  if (!context.user || !context.workspaceId)
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in to generate AI suggestions." } },
      { status: 401 },
    );
  if (!roleCan(context.role, "suggestion:generate"))
    return NextResponse.json(
      {
        error: { code: "FORBIDDEN", message: "Only Owners and Editors may generate suggestions." },
      },
      { status: 403 },
    );
  if (!isGeminiConfigured)
    return NextResponse.json(
      {
        error: {
          code: "AI_NOT_CONFIGURED",
          message:
            "Add GEMINI_API_KEY to enable AI suggestions. Deterministic audits remain available.",
        },
      },
      { status: 503 },
    );
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "SUPABASE_NOT_CONFIGURED",
          message: "Configure the server-only Supabase service key to use AI suggestions.",
        },
      },
      { status: 503 },
    );
  }
  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify([
        context.workspaceId,
        parsed.data,
        SUGGESTIONS_PROMPT_VERSION,
        env.GEMINI_MODEL,
      ]),
    )
    .digest("hex");
  const { data: cached } = await admin
    .from("ai_cache")
    .select("response")
    .eq("cache_key", cacheKey)
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  let payload = cached?.response as
    (z.infer<typeof suggestionSchema> & { model?: string; promptVersion?: string }) | null;
  if (!payload) {
    const { data: allowed, error: quotaError } = await admin.rpc("consume_workspace_ai_usage", {
      target_workspace: context.workspaceId,
      target_user: context.user.id,
    });
    if (quotaError)
      return NextResponse.json(
        {
          error: {
            code: "USAGE_CHECK_FAILED",
            message: "Could not verify the workspace AI usage limit.",
          },
        },
        { status: 503 },
      );
    if (!allowed)
      return NextResponse.json(
        {
          error: {
            code: "USAGE_LIMIT",
            message: "Your workspace has reached its monthly AI generation limit.",
          },
        },
        { status: 429 },
      );
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    let repair: string | undefined;
    let providerFailed = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await withRateLimitBackoff(() =>
          ai.models.generateContent({
            model: env.GEMINI_MODEL,
            contents: suggestionsPrompt(parsed.data, repair),
            config: {
              responseMimeType: "application/json",
              responseJsonSchema: aiSuggestionJsonSchema,
            },
          }),
        );
        const decoded = suggestionSchema.safeParse(JSON.parse(result.text ?? ""));
        const locked = decoded.success
          ? factLock(
              `${parsed.data.title} ${parsed.data.vendor} ${parsed.data.productType} ${parsed.data.description}`,
              `${decoded.data.title} ${decoded.data.meta_description} ${decoded.data.description_html}`,
            )
          : { valid: false, unsupported: [] };
        if (decoded.success && locked.valid) {
          payload = {
            ...decoded.data,
            description_html: sanitizeDescriptionHtml(decoded.data.description_html),
            model: env.GEMINI_MODEL,
            promptVersion: SUGGESTIONS_PROMPT_VERSION,
          };
          await admin
            .from("ai_cache")
            .upsert({ cache_key: cacheKey, workspace_id: context.workspaceId, response: payload });
          break;
        }
        repair = decoded.success
          ? `Unsupported facts: ${locked.unsupported.join(", ")}`
          : decoded.error.message;
      } catch (error) {
        providerFailed = true;
        repair = error instanceof Error ? error.message.slice(0, 300) : "Invalid response";
      }
    }
    if (!payload)
      return NextResponse.json(
        {
          error: {
            code: providerFailed ? "AI_PROVIDER_FAILED" : "AI_VALIDATION_FAILED",
            message: providerFailed
              ? "Gemini could not complete the request. Verify the API key, model, project quota, and network access."
              : "The generated draft failed validation. Please edit it manually.",
          },
        },
        { status: providerFailed ? 502 : 422 },
      );
  }
  const { data: product, error: productError } = await admin
    .from("products")
    .select("id")
    .eq("id", parsed.data.productId)
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (productError || !product)
    return NextResponse.json(
      {
        error: {
          code: "PRODUCT_NOT_FOUND",
          message: "Product is not available in this workspace.",
        },
      },
      { status: 404 },
    );
  if (parsed.data.issueId) {
    const { data: issue, error: issueError } = await admin
      .from("audit_issues")
      .select("id")
      .eq("id", parsed.data.issueId)
      .eq("product_id", product.id)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (issueError)
      return NextResponse.json(
        {
          error: {
            code: "ISSUE_READ_FAILED",
            message: "Could not verify the selected audit finding.",
          },
        },
        { status: 500 },
      );
    if (!issue)
      return NextResponse.json(
        {
          error: {
            code: "ISSUE_NOT_FOUND",
            message: "The selected audit finding is unavailable.",
          },
        },
        { status: 404 },
      );
  }
  const suggestedValue =
    parsed.data.field === "title" || parsed.data.field === "seoTitle"
      ? payload.title
      : parsed.data.field === "seoDescription"
        ? payload.meta_description
        : payload.description_html;
  const { data: suggestion, error: suggestionError } = await admin
    .from("suggestions")
    .insert({
      workspace_id: context.workspaceId,
      issue_id: parsed.data.issueId ?? null,
      product_id: product.id,
      field: parsed.data.field,
      current_value: parsed.data.currentValue,
      suggested_value: suggestedValue,
      status: "draft",
      confidence: payload.confidence,
      model: env.GEMINI_MODEL,
      prompt_version: SUGGESTIONS_PROMPT_VERSION,
    })
    .select("id,status")
    .single();
  if (suggestionError)
    return NextResponse.json(
      { error: { code: "SUGGESTION_SAVE_FAILED", message: "Could not save the AI draft." } },
      { status: 500 },
    );
  return NextResponse.json({ ...payload, suggestion });
}

async function withRateLimitBackoff<T>(operation: () => Promise<T>): Promise<T> {
  for (let retry = 0; retry < 4; retry++) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/(429|rate.?limit|503|temporar)/i.test(message) || retry === 3) throw error;
      const delay = Math.min(8000, 500 * 2 ** retry) + Math.floor(Math.random() * 300);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Gemini request exhausted its retry budget");
}
