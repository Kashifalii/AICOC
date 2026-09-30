import { describe, expect, it } from "vitest";
import { demoProducts } from "@/data/demo-products";
import supabaseSeed from "../../../supabase/seed/demo-store.json";
import { auditProducts, RULE_IDS, validGtin } from "@/lib/audit/rules";
import { jaccardSimilarity } from "@/lib/audit/duplicates";
import { productJsonLd, validateProductJsonLd } from "@/lib/audit/jsonld";
import type { AuditIssue, Product } from "@/lib/audit/types";

const seed = demoProducts;
const cleanProduct: Product = {
  id: "clean-control",
  title: "Everyday Cotton Tee",
  description:
    "<p>This everyday cotton tee offers a comfortable layer for regular routines and changing plans. Thoughtful stitching and a relaxed silhouette create a balanced fit that works with familiar wardrobe pieces. The breathable cotton fabric has a soft surface and a clean finish. Wear it on its own or add a light outer layer for cooler moments. Product details include the listed size, color, and material. Follow the care label when washing and allow the garment to dry naturally. Northstar Goods presents clear catalog information so shoppers can compare options and choose a style that suits their needs. Its adaptable shape makes it a useful choice through the season.</p>",
  vendor: "Northstar Goods",
  productType: "Apparel",
  handle: "everyday-cotton-tee",
  seoTitle: "Everyday Cotton Tee | Northstar Goods",
  seoDescription:
    "Everyday cotton tee from Northstar Goods with soft fabric, relaxed fit, and thoughtful stitching. Review size and care details before choosing.",
  price: 24,
  sku: "NS-TEE-1",
  tags: ["apparel", "cotton"],
  images: [
    {
      url: "https://cdn.example.test/cotton-tee-front.jpg",
      alt: "Cotton tee shown from the front",
    },
  ],
  collections: ["apparel"],
  attributes: { size: "M", color: "Blue", material: "Cotton" },
  gtin: "036000291452",
};

const idsFor = (products: Product[], externalLinks: ReadonlySet<string> = new Set()) =>
  new Set(auditProducts(products, 0.8, externalLinks).map((issue) => issue.ruleId));
const issuesFor = (
  products: Product[],
  ruleId: string,
  externalLinks: ReadonlySet<string> = new Set(),
) => auditProducts(products, 0.8, externalLinks).filter((issue) => issue.ruleId === ruleId);
const withChanges = (changes: Partial<Product>, product = cleanProduct): Product => ({
  ...product,
  ...changes,
});

describe("Section 5.1 rule catalog", () => {
  it("exposes every SRS rule ID and flags the intentional seed defects", () => {
    expect(RULE_IDS).toHaveLength(19);
    expect(supabaseSeed).toEqual(demoProducts);
    expect(idsFor(seed, new Set(["demo-095"]))).toEqual(new Set(RULE_IDS));
  });

  it("matches the required fixture defect counts and keeps the clean control clear", () => {
    const issues = auditProducts(seed);
    const count = (ruleId: string) => issues.filter((issue) => issue.ruleId === ruleId).length;
    expect(count("SEO-001")).toBe(5);
    expect(count("SEO-002")).toBe(15);
    expect(count("SEO-003")).toBe(10);
    expect(count("SEO-004")).toBe(20);
    expect(count("SEO-005")).toBe(15);
    expect(count("SEO-006")).toBe(1);
    expect(count("IMG-001")).toBe(40);
    expect(count("IMG-002")).toBe(10);
    expect(count("CNT-001")).toBe(12);
    expect(count("CNT-002")).toBe(16);
    expect(count("CNT-003")).toBe(14);
    expect(count("CNT-004")).toBe(2);
    expect(count("DAT-001")).toBe(10);
    expect(count("DAT-002")).toBe(10);
    expect(count("DAT-003")).toBe(25);
    expect(count("SCH-001")).toBe(5);
    expect(count("LNK-001")).toBe(6);
    expect(count("LNK-002")).toBe(8);
    expect(auditProducts([cleanProduct])).toEqual([]);
  });

  it("SEO-001 through SEO-006 enforce presence, ranges, uniqueness and handle policy", () => {
    expect(issuesFor([withChanges({ seoTitle: "" })], "SEO-001")).toHaveLength(1);
    expect(issuesFor([withChanges({ seoTitle: "A short title" })], "SEO-002")).toHaveLength(1);
    expect(
      issuesFor([cleanProduct, withChanges({ id: "duplicate-title" })], "SEO-003"),
    ).toHaveLength(2);
    expect(issuesFor([withChanges({ seoDescription: "" })], "SEO-004")).toHaveLength(1);
    expect(issuesFor([withChanges({ seoDescription: "Too short" })], "SEO-005")).toHaveLength(1);
    expect(issuesFor([withChanges({ handle: "123456" })], "SEO-006")).toHaveLength(1);
    expect(issuesFor([withChanges({ handle: "Upper-Case" })], "SEO-006")).toHaveLength(1);
    expect(issuesFor([withChanges({ seoTitle: "A".repeat(30) })], "SEO-002")).toHaveLength(0);
    expect(issuesFor([withChanges({ seoTitle: "A".repeat(60) })], "SEO-002")).toHaveLength(0);
  });

  it("IMG-001 and IMG-002 distinguish missing alt from low-quality alt", () => {
    expect(
      issuesFor(
        [withChanges({ images: [{ url: "https://cdn.example.test/item.jpg", alt: "" }] })],
        "IMG-001",
      ),
    ).toHaveLength(1);
    expect(
      issuesFor(
        [withChanges({ images: [{ url: "https://cdn.example.test/item.jpg", alt: "item.jpg" }] })],
        "IMG-002",
      ),
    ).toHaveLength(1);
    expect(
      issuesFor(
        [
          withChanges({
            images: [
              {
                url: "https://cdn.example.test/item.jpg",
                alt: "blue blue blue cotton cotton cotton shirt shirt shirt",
              },
            ],
          }),
        ],
        "IMG-002",
      ),
    ).toHaveLength(1);
    expect(
      issuesFor(
        [
          withChanges({
            images: [
              {
                url: "https://cdn.example.test/item.jpg",
                alt: "Blue cotton shirt shown from the front",
              },
            ],
          }),
        ],
        "IMG-002",
      ),
    ).toHaveLength(0);
  });

  it("CNT-001 through CNT-004 cover thin text, normalized duplicates, Jaccard candidates and invalid HTML", () => {
    expect(
      issuesFor([withChanges({ description: "Only a few words here." })], "CNT-001"),
    ).toHaveLength(1);
    expect(
      issuesFor(
        [
          cleanProduct,
          withChanges({ id: "exact-copy", description: cleanProduct.description.toUpperCase() }),
        ],
        "CNT-002",
      ),
    ).toHaveLength(2);
    expect(jaccardSimilarity(cleanProduct.description, cleanProduct.description)).toBe(1);
    expect(
      issuesFor(
        [
          cleanProduct,
          withChanges({
            id: "near-copy",
            description: cleanProduct.description.replace("cotton", "linen"),
          }),
        ],
        "CNT-003",
      ),
    ).toHaveLength(2);
    expect(
      issuesFor([withChanges({ description: "<p><strong>broken</p></strong>" })], "CNT-004"),
    ).toHaveLength(1);
    expect(
      issuesFor([withChanges({ description: "<p style='color:red'>inline</p>" })], "CNT-004"),
    ).toHaveLength(1);
    expect(
      issuesFor([withChanges({ description: "<p>Valid paragraph.</p>" })], "CNT-004"),
    ).toHaveLength(0);
  });

  it("DAT-001 through DAT-003 validate required fields, metadata and category schemas", () => {
    expect(issuesFor([withChanges({ tags: [] })], "DAT-001")).toHaveLength(1);
    expect(issuesFor([withChanges({ price: 0 })], "DAT-002")).toHaveLength(1);
    expect(validGtin("036000291452")).toBe(true);
    expect(validGtin("036000291450")).toBe(false);
    expect(issuesFor([withChanges({ gtin: "036000291450" })], "DAT-002")).toHaveLength(1);
    expect(
      issuesFor(
        [withChanges({ metafields: { custom: { type: "json", value: "{bad" } } })],
        "DAT-002",
      ),
    ).toHaveLength(1);
    expect(
      issuesFor([withChanges({ attributes: { size: "M", color: "Blue" } })], "DAT-003"),
    ).toHaveLength(1);
  });

  it("SCH-001 and SCH-002 distinguish required and recommended JSON-LD fields", () => {
    expect(issuesFor([withChanges({ images: [] })], "SCH-001")).toHaveLength(1);
    expect(issuesFor([withChanges({ gtin: undefined })], "SCH-002")).toHaveLength(1);
    expect(validateProductJsonLd(productJsonLd(cleanProduct))).toEqual([]);
  });

  it("LNK-001 detects missing internal targets; LNK-002 honors inbound product links", () => {
    const target = withChanges({ id: "target", handle: "target-product" });
    const source = withChanges({
      id: "source",
      description: `${cleanProduct.description} <a href="/products/not-present">broken</a>`,
    });
    expect(issuesFor([source, target], "LNK-001")).toHaveLength(1);
    expect(issuesFor([source, target], "LNK-002")).toHaveLength(0);
    const inbound = withChanges({
      ...target,
      collections: [],
    });
    const validLink = withChanges({
      ...source,
      description: `${cleanProduct.description} <a href="/products/target-product">target</a>`,
    });
    expect(issuesFor([validLink, inbound], "LNK-001")).toHaveLength(0);
    expect(issuesFor([validLink, inbound], "LNK-002")).toHaveLength(0);
    expect(issuesFor([cleanProduct], "LNK-001", new Set([cleanProduct.id]))).toHaveLength(1);
  });

  it("calculates issue impact using severity, affected reach and fixability", () => {
    const duplicateIssues: AuditIssue[] = issuesFor(
      [cleanProduct, withChanges({ id: "dup" })],
      "SEO-003",
    );
    expect(duplicateIssues[0].impact).toBeCloseTo(7.2);
  });
});
