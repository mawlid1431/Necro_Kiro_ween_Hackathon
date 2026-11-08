import { decodeHTML } from "entities";

// HTML -> plain text without Node APIs, so Convex queries (V8 runtime) can use it.
// (lib/feeds/normalize.ts has the same idea but imports node:crypto, which queries cannot load.)
export function htmlToPlain(html: string, max = Infinity): string {
  const text = decodeHTML(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
