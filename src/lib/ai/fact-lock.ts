const NUMBER = /\b\d+(?:\.\d+)?\s?(?:%|inches|inch|cm|mm|kg|g|oz|lb|lbs)?\b/gi;
const FACT_TERMS = new Set(
  "cotton organic linen polyester leather wool silk nylon bamboo denim suede hemp rubber steel aluminum aluminium ceramic wood glass plastic vegan waterproof hypoallergenic recyclable recycled red blue green black white yellow purple orange pink navy beige gray grey brown small medium large xxs xs xl xxl xxxl s m l extra-small extra-small extra-large ingredients dimension dimensions inch inches centimeter centimeters centimetre centimetres millimeter millimeters millimetre millimetres ounce ounces pound pounds kilogram kilograms gram grams".split(
    " ",
  ),
);
export function factLock(
  source: string,
  output: string,
): { valid: boolean; unsupported: string[] } {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const sourceFacts = [...source.matchAll(NUMBER)].map((match) => normalize(match[0]));
  const outputFacts = [...output.matchAll(NUMBER)].map((match) => normalize(match[0]));
  const allowed = new Set(sourceFacts);
  const unsupported = [...new Set(outputFacts.filter((value) => !allowed.has(value)))];
  const sourceTerms = new Set(source.toLowerCase().match(/[a-z]+/g) ?? []);
  for (const term of output.toLowerCase().match(/[a-z]+/g) ?? [])
    if (FACT_TERMS.has(term) && !sourceTerms.has(term)) unsupported.push(term);
  const unique = [...new Set(unsupported)];
  return { valid: unique.length === 0, unsupported: unique };
}
