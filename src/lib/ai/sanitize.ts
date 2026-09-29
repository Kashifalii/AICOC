const ALLOWED = new Set(["p", "ul", "ol", "li", "strong", "em", "h2", "h3", "a", "br"]);
export function sanitizeDescriptionHtml(input: string): string {
  return input
    .replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<([^>]+)>/g, (whole, raw: string) => {
      const closing = raw.startsWith("/");
      const parsed = raw.match(/^\/?\s*([a-z0-9]+)/i);
      const tag = parsed?.[1].toLowerCase();
      if (!tag || !ALLOWED.has(tag)) return "";
      if (closing) return tag === "br" ? "" : `</${tag}>`;
      if (tag === "a") {
        const href = raw.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
        if (href && (/^https:\/\//i.test(href) || /^\/(?!\/)/.test(href)))
          return `<a href="${href.replace(/["<>]/g, "")}" rel="noopener noreferrer">`;
      }
      return `<${tag}>`;
    });
}
