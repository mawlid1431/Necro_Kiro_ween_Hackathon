import { createHash } from "node:crypto";
import { decodeHTML } from "entities";
import { sanitizeArticle } from "../sanitize";

export interface RawItem {
  guid?: string | null;
  title?: string | null;
  link?: string | null;
  author?: string | null;
  published?: string | null;
  contentHtml?: string | null;
}

export interface NormalizedItem {
  guid: string;
  title: string;
  link: string | null;
  author: string | null;
  publishedAt: number; // epoch ms
  hasDate: boolean; // false when the feed gave no usable date
  contentHtml: string; // sanitised
  excerpt: string; // plain text, max 300 chars
}

export interface NormalizeContext {
  baseUrl: string; // the feed URL after redirects
  fetchedAt: number; // epoch ms
}

const DAY = 86_400_000;

// Returns null for items with nothing to show (no title, link or content).
export function normalizeItem(raw: RawItem, ctx: NormalizeContext): NormalizedItem | null {
  const link = toHttpUrl(raw.link, ctx.baseUrl);
  const contentHtml = sanitizeArticle(raw.contentHtml ?? "", link ?? ctx.baseUrl);
  const text = htmlToText(contentHtml);
  const title = cleanText(raw.title ?? "") || truncate(text, 80) || "";
  if (!title && !link && !text) return null;

  const parsed = parseFeedDate(raw.published);
  const publishedAt = parsed === null ? ctx.fetchedAt : Math.min(parsed, ctx.fetchedAt + DAY);

  // Stable identity across polls: explicit guid, then link, then a content hash.
  // Never hash the fetch time, or every poll would create a duplicate.
  const guid =
    clean(raw.guid) ??
    link ??
    "h:" + createHash("sha256").update(`${title}\n${text.slice(0, 500)}`).digest("hex").slice(0, 32);

  return {
    guid,
    title: title || "Untitled",
    link,
    author: cleanText(raw.author ?? "") || null,
    publishedAt,
    hasDate: parsed !== null,
    contentHtml,
    excerpt: truncate(text, 300),
  };
}

const TZ: Record<string, string> = {
  UT: "+0000", UTC: "+0000", GMT: "+0000", Z: "+0000",
  EST: "-0500", EDT: "-0400", CST: "-0600", CDT: "-0500",
  MST: "-0700", MDT: "-0600", PST: "-0800", PDT: "-0700",
};

// Handles RFC 822/2822 (RSS), RFC 3339/ISO 8601 (Atom, dc:date) and common quirks.
export function parseFeedDate(input: string | null | undefined): number | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;

  let t = Date.parse(s);
  if (Number.isNaN(t)) {
    s = s
      .replace(/^[A-Za-z]{2,9},?\s+/, "") // drop a day name, including non-English ones
      .replace(/\b([A-Z]{1,4})$/, (m) => TZ[m] ?? m) // named zones -> offsets
      .replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, "$1T$2") // "2026-11-08 10:00" -> ISO
      .replace(/(\d{1,2}:\d{2})(\s|$)/, "$1:00$2") // add missing seconds
      .replace(/\b(\d{1,2}) ([A-Za-z]{3}) (\d{2}) /, (_m, d, mo, y) => `${d} ${mo} ${Number(y) > 50 ? "19" : "20"}${y} `);
    t = Date.parse(s);
  }
  if (Number.isNaN(t)) return null;
  if (t < Date.UTC(1990, 0, 1)) return null; // reject nonsense like year 0001
  return t;
}

export function cleanText(s: string): string {
  return decodeHTML(stripTags(s)).replace(/\s+/g, " ").trim();
}

export function htmlToText(html: string): string {
  return cleanText(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " "));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut) + "…";
}

function clean(s: string | null | undefined): string | null {
  const v = s?.trim();
  return v ? v : null;
}

export function toHttpUrl(u: string | null | undefined, base: string): string | null {
  const v = clean(u);
  if (!v) return null;
  try {
    const url = new URL(decodeHTML(v), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
