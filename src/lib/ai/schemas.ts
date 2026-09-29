import { z } from "zod";

export const explanationSchema = z.object({
  why_it_matters: z.string().min(20).max(600),
  impact: z.string().min(5).max(240),
  fix_summary: z.string().min(5).max(240),
  confidence: z.number().min(0).max(1),
});
export const suggestionSchema = z.object({
  title: z.string().min(30).max(60),
  meta_description: z.string().min(70).max(160),
  description_html: z.string().max(10000),
  confidence: z.number().min(0).max(1),
});
export const aiSuggestionJsonSchema = {
  type: "OBJECT",
  required: ["title", "meta_description", "description_html", "confidence"],
  properties: {
    title: { type: "STRING" },
    meta_description: { type: "STRING" },
    description_html: { type: "STRING" },
    confidence: { type: "NUMBER" },
  },
};
