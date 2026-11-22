// Reads a page's Open Graph / Twitter card tags: the same tags X and LinkedIn read to draw a link card.

export type LinkCard = {
  url: string;
  domain: string;
  title?: string;
  description?: string;
  image?: string;
  card: "summary" | "summary_large_image";
};

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();

function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const val = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const content = val?.[1] ?? val?.[2];
    if (key && content && !out.has(key)) out.set(key, decode(content));
  }
  return out;
}

export function parseLinkCard(html: string, pageUrl: string): LinkCard {
  const base = new URL(pageUrl);
  const m = metaTags(html);
  const pick = (...keys: string[]) => keys.map((k) => m.get(k)).find(Boolean);
  let image: string | undefined;
  const raw = pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src");
  try {
    image = raw ? new URL(raw, base).toString() : undefined;
  } catch {
    image = undefined;
  }
  if (image && !/^https?:\/\//.test(image)) image = undefined;
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  return {
    url: base.toString(),
    domain: base.hostname.replace(/^www\./, ""),
    title: pick("og:title", "twitter:title") ?? (titleTag ? decode(titleTag) : undefined),
    description: pick("og:description", "twitter:description", "description"),
    image,
    card: m.get("twitter:card") === "summary" || !image ? "summary" : "summary_large_image",
  };
}
