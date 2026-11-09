// Picks the best site icon from a page's <head>: the largest declared icon, apple-touch-icon,
// or an SVG. Feed <image> tags are often 32x32 and look broken when scaled up on a tombstone.
import { decodeHTML } from "entities";

const LINK = /<link\b[^>]*>/gi;
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((x) => x !== undefined);

/** Score: the icon's pixel size (SVG counts as large). Icons under 48 px score low, so a bigger one wins. */
function score(rel: string, sizes: string | undefined, href: string): number {
  if (/\.svg(\?|$)/i.test(href) || sizes === "any") return 512;
  const px = Math.max(0, ...[...(sizes ?? "").matchAll(/(\d+)\s*x\s*(\d+)/gi)].map((m) => Math.min(Number(m[1]), Number(m[2]))));
  if (px) return px;
  if (/apple-touch-icon/i.test(rel)) return 180; // the convention when sizes is missing
  return 16; // a plain rel="icon" with no size is usually a small favicon
}

export function bestIcon(html: string, baseUrl: string): string | null {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd === -1 ? html.slice(0, 100_000) : html.slice(0, headEnd);
  let best: { url: string; s: number } | null = null;
  for (const tag of head.match(LINK) ?? []) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    if (!/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel)) continue;
    const raw = attr(tag, "href");
    if (!raw) continue;
    let url: string;
    try {
      url = new URL(decodeHTML(raw.trim()), baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https:\/\//i.test(url)) continue; // only https icons: no mixed content, no data: or javascript:
    const s = score(rel, attr(tag, "sizes"), url);
    if (!best || s > best.s) best = { url, s };
  }
  return best && best.s >= 48 ? best.url : null;
}

/** True when an icon URL looks small (WordPress "-32x32", "favicon.ico"), so a page lookup is worth it. */
export function looksSmall(url: string | null | undefined): boolean {
  if (!url) return true;
  return /favicon\.ico(\?|$)/i.test(url) || /[-_](16|24|32)x\1\.(png|jpe?g|gif|ico)/i.test(url);
}
