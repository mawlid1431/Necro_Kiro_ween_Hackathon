// Lead image of an article: the best picture the feed itself offers, as a safe https URL.
// Order: Media RSS content (largest) > Media RSS thumbnail > image enclosure > iTunes image > first <img> in the body.
// Never data: or javascript: URLs, never tracking pixels. http is upgraded to https so the page never shows mixed content
// (the UI hides an image that fails to load).

export interface ImageCandidate {
  url: string | null | undefined;
  type?: string | null; // MIME type when the feed says it (enclosure, media:content)
  medium?: string | null; // media:content medium="image" | "video" ...
  width?: number | null;
  height?: number | null;
  priority?: number; // lower wins: 0 media:content, 1 media:thumbnail, 2 enclosure, 3 itunes:image
}

const IMAGE_EXT = /\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i;
// A whole path segment or file name like /pixel.gif, /spacer.png, /1x1.gif, /tracking/..., plus FeedBurner's trackers.
const PIXEL_HINT = /\/(pixel|spacer|blank|1x1|transparent|tracking|beacon)(\.[a-z]{3,4})?(\/|$)|\/~r\/|\/~ff\//i;

export function safeImageUrl(raw: string | null | undefined, base: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(s, base);
  } catch {
    return null;
  }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (PIXEL_HINT.test(u.pathname)) return null;
  return u.toString();
}

function isImage(c: ImageCandidate): boolean {
  if (c.medium) return c.medium.toLowerCase() === "image";
  if (c.type) return c.type.toLowerCase().startsWith("image/");
  return IMAGE_EXT.test(c.url ?? "");
}

function tooSmall(c: { width?: number | null; height?: number | null }): boolean {
  return (c.width != null && c.width <= 2) || (c.height != null && c.height <= 2);
}

/** The first <img> in sanitised article HTML that is not a tracking pixel. */
export function firstBodyImage(html: string): ImageCandidate | null {
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  let seen = 0;
  while ((m = re.exec(html)) && seen++ < 20) {
    const tag = m[0];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src) continue;
    const width = Number(/\bwidth\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? NaN);
    const height = Number(/\bheight\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? NaN);
    const c = { url: src, width: Number.isNaN(width) ? null : width, height: Number.isNaN(height) ? null : height };
    if (!tooSmall(c)) return c;
  }
  return null;
}

/** Picks the lead image. `candidates` are in feed-preference order; the body image is the last resort. */
export function pickImage(candidates: ImageCandidate[], bodyHtml: string, base: string): string | null {
  const images = candidates.filter((c) => c.url && isImage(c) && !tooSmall(c));
  // Source priority first, then the widest image of that source; feed order among equals.
  const ranked = images
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.priority ?? 0) - (b.c.priority ?? 0) || (b.c.width ?? 0) - (a.c.width ?? 0) || a.i - b.i)
    .map((x) => x.c);
  for (const c of ranked) {
    const u = safeImageUrl(c.url, base);
    if (u) return u;
  }
  const body = firstBodyImage(bodyHtml);
  return body ? safeImageUrl(body.url, base) : null;
}
