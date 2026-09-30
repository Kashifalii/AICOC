import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { roleCan } from "@/lib/authz/roles";
import { isPublicPath } from "@/lib/authz/route-policy";

describe("workspace role capabilities", () => {
  it("limits approval and publishing to the roles specified by the SRS", () => {
    expect(roleCan("Reviewer", "suggestion:approve")).toBe(true);
    expect(roleCan("Owner", "suggestion:reject")).toBe(true);
    expect(roleCan("Editor", "suggestion:approve")).toBe(false);
    expect(roleCan("Editor", "publish:create")).toBe(false);
    expect(roleCan("Owner", "publish:create")).toBe(true);
  });

  it("keeps Viewer read-only and requires Owner for store connection", () => {
    expect(roleCan("Viewer", "product:read")).toBe(true);
    expect(roleCan("Viewer", "product:write")).toBe(false);
    expect(roleCan("Viewer", "audit:create")).toBe(false);
    expect(roleCan("Editor", "store:connect")).toBe(false);
    expect(roleCan("Owner", "store:connect")).toBe(true);
    expect(roleCan(null, "workspace:read")).toBe(false);
  });
});

describe("authentication and database access policies", () => {
  it("allows only the sign-in page and auth callback without a session", () => {
    expect(isPublicPath("/sign-in")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/api/demo/seed")).toBe(false);
    expect(isPublicPath("/dashboard")).toBe(false);
  });

  it("declares tenant RLS, role helpers and relationship guards", () => {
    const sql = readFileSync("supabase/migrations/202609300004_role_scoped_rls.sql", "utf8");
    for (const table of [
      "workspaces",
      "workspace_members",
      "stores",
      "products",
      "product_images",
      "collections",
      "product_collections",
      "brand_voices",
      "audits",
      "audit_issues",
      "suggestions",
      "jobs",
      "job_items",
      "ai_cache",
      "plan_limits",
      "usage_events",
      "publish_batches",
      "publish_items",
      "activity_log",
    ])
      expect(sql).toContain(`'${table}'`);
    expect(sql).toContain("security definer");
    expect(sql).toContain("tenant_products before insert or update");
    expect(sql).toContain("is_workspace_owner(workspace_id)");
    expect(sql).toContain("is_workspace_editor(workspace_id)");
  });

  it("requires approved state in the database publish-item trigger", () => {
    const sql = readFileSync("supabase/migrations/202609300001_initial_schema.sql", "utf8");
    expect(sql).toContain("publish_items_require_approval");
    expect(sql).toContain("status='approved'");
    expect(sql).toContain("transition_suggestion");
    const publishSql = readFileSync(
      "supabase/migrations/202609300005_simulated_publish.sql",
      "utf8",
    );
    expect(publishSql).toContain("item.status <> 'approved'");
    expect(publishSql).toContain("insert into public.publish_items");
    expect(publishSql).toContain("perform public.transition_suggestion(item.id,'published')");
  });
});
