import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { roleCan } from "@/lib/authz/roles";
import { mapShopifyCsv } from "@/lib/utils/csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedWorkspace } from "@/lib/supabase/server";

const inputSchema = z
  .object({
    fileName: z.string().min(1).max(180),
    csv: z.string().min(1).max(4_000_000),
  })
  .strict();

function apiError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", "CSV upload is invalid or too large.", 400);
  const mapped = mapShopifyCsv(parsed.data.csv);
  if (!mapped.products.length)
    return NextResponse.json(
      {
        error: { code: "CSV_EMPTY", message: "No valid product rows were found." },
        errors: mapped.errors,
      },
      { status: 422 },
    );
  if (mapped.products.length > 5000)
    return apiError("CSV_TOO_LARGE", "CSV imports are limited to 5,000 valid products.", 413);
  try {
    const { user, workspaceId, role } = await getAuthenticatedWorkspace();
    if (!user || !workspaceId)
      return apiError("UNAUTHENTICATED", "Sign in to save a CSV import.", 401);
    if (!roleCan(role, "store:import"))
      return apiError("FORBIDDEN", "Editor access is required to import products.", 403);
    const admin = createAdminClient();
    const baseName = parsed.data.fileName.replace(/[^\w.-]+/g, "_").slice(0, 100);
    const { data: store, error: storeError } = await admin
      .from("stores")
      .insert({
        workspace_id: workspaceId,
        name: `${baseName} ${new Date().toISOString()}`,
        type: "csv",
      })
      .select("id,name,type")
      .single();
    if (storeError || !store)
      return apiError("STORE_CREATE_FAILED", "Could not create the CSV store.", 500);

    const rows = mapped.products.map((product, index) => {
      const title = product.title ?? "";
      const description = product.description ?? "";
      const externalId = `csv:${index + 1}:${createHash("sha256")
        .update(`${product.handle}\n${title}\n${description}`)
        .digest("hex")
        .slice(0, 20)}`;
      return {
        workspace_id: workspaceId,
        store_id: store.id,
        external_id: externalId,
        handle: product.handle ?? `product-${index + 1}`,
        title,
        vendor: product.vendor ?? "",
        description_html: description,
        seo_title: product.seoTitle ?? "",
        seo_description: product.seoDescription ?? "",
        category: product.productType ?? "",
        attributes: {},
        metafields: {},
        price: product.price ?? 0,
        sku: product.sku ?? "",
        tags: [],
        gtin: null,
        content_hash: createHash("sha256").update(`${title}\n${description}`).digest("hex"),
      };
    });
    for (let offset = 0; offset < rows.length; offset += 200) {
      const { error } = await admin.from("products").insert(rows.slice(offset, offset + 200));
      if (error) {
        await admin.from("stores").delete().eq("id", store.id).eq("workspace_id", workspaceId);
        return apiError("PRODUCT_SAVE_FAILED", "Could not save the complete CSV import.", 500);
      }
    }
    return NextResponse.json(
      {
        store,
        imported: rows.length,
        errors: mapped.errors,
      },
      { status: 201 },
    );
  } catch {
    return apiError(
      "CSV_IMPORT_UNAVAILABLE",
      "Saving CSV imports requires Supabase persistence.",
      503,
    );
  }
}
