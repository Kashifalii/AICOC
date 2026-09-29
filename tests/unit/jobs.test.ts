import { describe, expect, it } from "vitest";
import { getBatchWindow } from "@/lib/jobs/batch";
import { toDemoProductRow } from "@/lib/jobs/demo-products";
import demoProducts from "@/data/demo-store.json";
import type { Product } from "@/lib/audit/types";

describe("resumable job batch windows", () => {
  it("advances in bounded, non-overlapping ranges", () => {
    expect(getBatchWindow(0, 25, 10)).toEqual({ start: 0, end: 10, next: 10, complete: false });
    expect(getBatchWindow(10, 25, 10)).toEqual({ start: 10, end: 20, next: 20, complete: false });
    expect(getBatchWindow(20, 25, 10)).toEqual({ start: 20, end: 25, next: 25, complete: true });
  });

  it("treats a retry at the same cursor as the same batch", () => {
    expect(getBatchWindow(10, 25, 10)).toEqual(getBatchWindow(10, 25, 10));
  });

  it("marks empty jobs complete and clamps cursors beyond the final item", () => {
    expect(getBatchWindow(0, 0, 10).complete).toBe(true);
    expect(getBatchWindow(99, 25, 10)).toEqual({ start: 25, end: 25, next: 25, complete: true });
  });

  it("rejects unsafe cursors and batch sizes", () => {
    expect(() => getBatchWindow(-1, 20, 10)).toThrow(RangeError);
    expect(() => getBatchWindow(0, 20, 0)).toThrow(RangeError);
    expect(() => getBatchWindow(0.5, 20, 10)).toThrow(RangeError);
  });
});

describe("Demo Store persistence mapping", () => {
  it("retains stable external IDs, normalized hashes, and all product fields", () => {
    const product = (demoProducts as Product[])[0];
    const row = toDemoProductRow(product, "workspace-id", "store-id");
    expect(row.external_id).toBe(product.id);
    expect(row.content_hash).toMatch(/^[a-f0-9]{8}$/);
    expect(row.description_html).toBe(product.description);
    expect(row.seo_title).toBe(product.seoTitle);
    expect(row.vendor).toBe(product.vendor);
    expect(row.attributes).toEqual(product.attributes);
  });
});
