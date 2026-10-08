import { NextResponse } from "next/server";
import { z } from "zod";
import { roleCan } from "@/lib/authz/roles";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const issueSchema = z.object({
  id: z.string().min(1).max(300),
  productId: z.string().uuid(),
  ruleId: z.string().min(1).max(40),
  category: z.string().min(1).max(100),
  severity: z.enum(["critical", "high", "medium", "low"]),
  field: z.string().min(1).max(100),
  evidence: z.string().max(4000),
  currentValue: z.string().max(10000),
  impact: z.number().nonnegative(),
});
const inputSchema = z
  .object({
    storeId: z.string().uuid(),
    score: z.number().min(0).max(100),
    issues: z.array(issueSchema).max(5000),
  })
  .strict();
const paramsSchema = z.object({ storeId: z.string().uuid() });

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", "Audit data is invalid.", 400);
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return apiError("UNAUTHENTICATED", "Sign in to save audit results.", 401);
    if (!roleCan(role, "audit:create"))
      return apiError("FORBIDDEN", "Editor access is required to save an audit.", 403);
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id")
      .eq("id", parsed.data.storeId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (storeError) return apiError("STORE_READ_FAILED", "Could not verify the audit store.", 500);
    if (!store) return apiError("STORE_NOT_FOUND", "Store is unavailable in this workspace.", 404);
    const productIds = [...new Set(parsed.data.issues.map((issue) => issue.productId))];
    if (productIds.length) {
      const { data: products, error: productError } = await supabase
        .from("products")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("store_id", store.id)
        .in("id", productIds);
      if (productError)
        return apiError("PRODUCT_READ_FAILED", "Could not verify audit products.", 500);
      if (products?.length !== productIds.length)
        return apiError(
          "PRODUCT_STORE_MISMATCH",
          "Audit contains products outside this store.",
          409,
        );
    }
    const { data: previous, error: previousError } = await supabase
      .from("audits")
      .select("score_after")
      .eq("workspace_id", workspaceId)
      .eq("store_id", store.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousError)
      return apiError("AUDIT_READ_FAILED", "Could not load previous audit score.", 500);
    const counts = Object.fromEntries(
      ["critical", "high", "medium", "low"].map((severity) => [
        severity,
        parsed.data.issues.filter((issue) => issue.severity === severity).length,
      ]),
    );
    const { data: audit, error: auditError } = await supabase
      .from("audits")
      .insert({
        workspace_id: workspaceId,
        store_id: store.id,
        rule_set_version: "1.0",
        scope: { type: "store" },
        status: "running",
        score_before: previous?.score_after ?? parsed.data.score,
        score_after: parsed.data.score,
        summary: { issueCount: parsed.data.issues.length, severity: counts },
      })
      .select("id,created_at")
      .single();
    if (auditError || !audit)
      return apiError("AUDIT_SAVE_FAILED", "Could not create audit history.", 500);

    const issueIds: Record<string, string> = {};
    for (let offset = 0; offset < parsed.data.issues.length; offset += 200) {
      const batch = parsed.data.issues.slice(offset, offset + 200).map((issue) => ({
        workspace_id: workspaceId,
        audit_id: audit.id,
        product_id: issue.productId,
        rule_id: issue.ruleId,
        category: issue.category,
        severity: issue.severity,
        field: issue.field,
        evidence: {
          text: issue.evidence,
          currentValue: issue.currentValue,
          issueKey: issue.id,
        },
        impact: issue.impact,
      }));
      const { data: inserted, error } = await supabase
        .from("audit_issues")
        .insert(batch)
        .select("id,evidence");
      if (error) {
        await supabase.from("audits").delete().eq("id", audit.id).eq("workspace_id", workspaceId);
        return apiError("AUDIT_ISSUES_SAVE_FAILED", "Could not save every audit finding.", 500);
      }
      for (const issue of inserted ?? []) {
        const evidence = issue.evidence as { issueKey?: string } | null;
        if (evidence?.issueKey) issueIds[evidence.issueKey] = issue.id;
      }
    }
    const { error: completeError } = await supabase
      .from("audits")
      .update({ status: "completed" })
      .eq("id", audit.id)
      .eq("workspace_id", workspaceId);
    if (completeError)
      return apiError(
        "AUDIT_FINALIZE_FAILED",
        "Audit findings were saved, but history could not be finalized.",
        500,
      );
    return NextResponse.json(
      { audit: { id: audit.id, createdAt: audit.created_at }, issueIds },
      { status: 201 },
    );
  } catch {
    return apiError("AUDIT_UNAVAILABLE", "Saving audits requires Supabase persistence.", 503);
  }
}

export async function GET(request: Request) {
  const parsed = paramsSchema.safeParse({
    storeId: new URL(request.url).searchParams.get("storeId"),
  });
  if (!parsed.success) return apiError("INVALID_INPUT", "A valid store id is required.", 400);
  try {
    const { supabase, user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return apiError("UNAUTHENTICATED", "Sign in to load audit history.", 401);
    if (!roleCan(role, "audit:read"))
      return apiError("FORBIDDEN", "Your workspace role cannot view audits.", 403);
    const { data: audits, error: auditsError } = await supabase
      .from("audits")
      .select("id,created_at,score_before,score_after,summary")
      .eq("workspace_id", workspaceId)
      .eq("store_id", parsed.data.storeId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(30);
    if (auditsError) return apiError("AUDIT_READ_FAILED", "Could not load saved audits.", 500);
    const latest = audits?.[0];
    if (!latest) return NextResponse.json({ audits: [], issues: [] });
    const { data: savedIssues, error: issuesError } = await supabase
      .from("audit_issues")
      .select("id,product_id,rule_id,category,severity,field,evidence,impact,products!inner(title)")
      .eq("workspace_id", workspaceId)
      .eq("audit_id", latest.id)
      .order("severity");
    if (issuesError)
      return apiError("AUDIT_ISSUES_READ_FAILED", "Could not load saved findings.", 500);
    const issues = (savedIssues ?? []).map((issue) => {
      const product = Array.isArray(issue.products) ? issue.products[0] : issue.products;
      const evidence = issue.evidence as { text?: string; currentValue?: string } | null;
      return {
        id: issue.id,
        productId: issue.product_id,
        productTitle: product?.title ?? "",
        ruleId: issue.rule_id,
        category: issue.category,
        severity: issue.severity,
        field: issue.field,
        evidence: evidence?.text ?? "",
        impact: Number(issue.impact),
        currentValue: evidence?.currentValue ?? "",
      };
    });
    return NextResponse.json({
      audits: audits ?? [],
      latestAuditId: latest.id,
      issues,
      score: Number(latest.score_after ?? 0),
      issueCount: Number(
        (latest.summary as { issueCount?: number } | null)?.issueCount ?? issues.length,
      ),
    });
  } catch {
    return apiError("AUDIT_UNAVAILABLE", "Audit history requires Supabase persistence.", 503);
  }
}
