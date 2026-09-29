import { normalizeText } from "./text";

export function shingles(text: string, size = 3): Set<string> {
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (words.length === 0) return new Set();
  if (words.length < size) return new Set([words.join(" ")]);
  return new Set(
    Array.from({ length: words.length - size + 1 }, (_, i) => words.slice(i, i + size).join(" ")),
  );
}

export function jaccardSimilarity(a: string, b: string, size = 3): number {
  const left = shingles(a, size);
  const right = shingles(b, size);
  if (!left.size && !right.size) return 1;
  const intersection = [...left].filter((item) => right.has(item)).length;
  return intersection / new Set([...left, ...right]).size;
}
