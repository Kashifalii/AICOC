import { describe, expect, it } from "vitest";
import { demoProducts } from "@/data/demo-products";
import type { Product } from "@/lib/audit/types";
import { auditProducts, validGtin } from "@/lib/audit/rules";
import { jaccardSimilarity } from "@/lib/audit/duplicates";
import { scoreProduct, scoreStore } from "@/lib/audit/scoring";
import { factLock } from "@/lib/ai/fact-lock";
import { canTransition, transitionSuggestion } from "@/lib/review/state-machine";
import { mapShopifyCsv } from "@/lib/utils/csv";
import { productJsonLd, validateProductJsonLd } from "@/lib/audit/jsonld";
import { sanitizeDescriptionHtml } from "@/lib/ai/sanitize";
import { createHmac } from "node:crypto";
import { validShopDomain, verifyShopifyHmac } from "@/lib/shopify/oauth";

const products = demoProducts;
describe("Demo Store", () => {
  it("contains exactly 100 deterministic products and intentional rule coverage", () => {
    expect(products).toHaveLength(100);
    const ids = new Set(
      auditProducts(products, 0.8, new Set(["demo-095"])).map((issue) => issue.ruleId),
    );
    for (const rule of [
      "SEO-001",
      "SEO-002",
      "SEO-003",
      "SEO-004",
      "SEO-005",
      "SEO-006",
      "IMG-001",
      "IMG-002",
      "CNT-001",
      "CNT-002",
      "CNT-003",
      "CNT-004",
      "DAT-001",
      "DAT-002",
      "DAT-003",
      "SCH-001",
      "SCH-002",
      "LNK-001",
      "LNK-002",
    ])
      expect(ids.has(rule), `${rule} should be seeded`).toBe(true);
  });
  it("keeps score bounded and repeatable", () => {
    const issues = auditProducts(products);
    const score = scoreStore(products, issues);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(scoreStore(products, issues)).toBe(score);
    expect(scoreProduct(products[0], issues)).toBeGreaterThanOrEqual(0);
  });
  it("does not flag a clean, complete product", () => {
    const clean: Product = {
      id: "clean-1",
      title: "Everyday Cotton Tee",
      description:
        "A comfortable everyday cotton tee made for versatile styling and dependable wear throughout the season. Thoughtful stitching and a relaxed silhouette create an easy layer for your daily wardrobe. Pair it with your favorite pieces for a simple and timeless look. Crafted with care by Northstar Goods and designed for lasting everyday comfort.",
      vendor: "Northstar Goods",
      productType: "Apparel",
      handle: "everyday-cotton-tee",
      seoTitle: "Everyday Cotton Tee | Northstar Goods",
      seoDescription:
        "Discover the Everyday Cotton Tee from Northstar Goods. Comfortable cotton, thoughtful stitching, and a relaxed fit make this an easy layer for daily wear.",
      price: 24,
      sku: "NS-TEE-1",
      tags: ["apparel", "cotton"],
      images: [
        {
          url: "https://cdn.example.test/everyday-tee.jpg",
          alt: "Cotton tee shown from the front",
        },
      ],
      collections: ["apparel"],
      attributes: { size: "M", color: "Blue", material: "Cotton" },
      gtin: "036000291452",
    };
    expect(validGtin(clean.gtin!)).toBe(true);
    expect(auditProducts([clean])).toEqual([]);
  });
});
describe("Jaccard similarity", () => {
  it("detects identical and similar descriptions and handles empty values", () => {
    expect(jaccardSimilarity("soft cotton blue shirt", "soft cotton blue shirt")).toBe(1);
    expect(
      jaccardSimilarity(
        "soft cotton blue shirt made for daily wear",
        "soft cotton green shirt made for daily wear",
      ),
    ).toBeGreaterThan(0.3);
    expect(jaccardSimilarity("", " ")).toBe(1);
  });
});
describe("fact lock", () => {
  it("allows supported facts and rejects new measurements", () => {
    expect(
      factLock("Made from 100% cotton, 12 inches wide", "100% cotton and 12 inches wide").valid,
    ).toBe(true);
    expect(factLock("Made from cotton", "Made from cotton, 100% organic").valid).toBe(false);
    expect(factLock("Made from linen", "Made from leather").valid).toBe(false);
  });
});
describe("AI HTML sanitization", () => {
  it("keeps allowlisted markup and drops unsafe content and attributes", () => {
    expect(
      sanitizeDescriptionHtml(
        '<p onclick="alert(1)">Safe <strong>copy</strong><script>alert(2)</script><a href="javascript:alert(3)">bad link</a></p>',
      ),
    ).toBe("<p>Safe <strong>copy</strong><a>bad link</a></p>");
  });
});
describe("Shopify OAuth verification", () => {
  it("validates shop domains and checks callback HMAC", () => {
    const params = new URLSearchParams({
      code: "abc",
      shop: "northstar.myshopify.com",
      state: "nonce",
      timestamp: "100",
    });
    const message = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    params.set("hmac", createHmac("sha256", "test-secret").update(message).digest("hex"));
    expect(validShopDomain("northstar.myshopify.com")).toBe(true);
    expect(validShopDomain("evil.example.com")).toBe(false);
    expect(verifyShopifyHmac(params, "test-secret")).toBe(true);
    params.set("code", "tampered");
    expect(verifyShopifyHmac(params, "test-secret")).toBe(false);
  });
});
describe("suggestion state machine", () => {
  it("requires reviewer approval and prevents publishing drafts", () => {
    expect(canTransition("pending_review", "approved", "Editor")).toBe(false);
    expect(canTransition("pending_review", "approved", "Reviewer")).toBe(true);
    expect(canTransition("draft", "published", "Owner")).toBe(false);
    expect(transitionSuggestion("approved", "published", "Owner")).toBe("published");
    expect(() => transitionSuggestion("draft", "published", "Owner")).toThrow();
  });
});
describe("Shopify CSV mapping", () => {
  it("maps Shopify headers and reports invalid rows", () => {
    const result = mapShopifyCsv(
      "Handle,Title,Body (HTML),Vendor,Type,Variant Price,Variant SKU\nblue-tee,Blue Tee,Soft cotton details,Northstar,Apparel,24.00,NS-1\n,Missing title,,Northstar,Apparel,not-a-price,",
    );
    expect(result.products).toHaveLength(1);
    expect(result.products[0].title).toBe("Blue Tee");
    expect(result.errors).toHaveLength(1);
  });
});
describe("Product JSON-LD", () => {
  it("emits required offer information", () => {
    expect(validateProductJsonLd(productJsonLd(products[0]))).toHaveLength(0);
    expect(validateProductJsonLd(productJsonLd({ ...products[0], gtin: undefined }))).toHaveLength(
      1,
    );
    expect(validateProductJsonLd({})).toHaveLength(8);
  });
});
