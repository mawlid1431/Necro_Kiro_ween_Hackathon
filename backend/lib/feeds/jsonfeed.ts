import { normalizeItem, cleanText, toHttpUrl, type NormalizedItem } from "./normalize";
import { FeedParseError, MAX_ITEMS_PER_FETCH, type ParsedFeed } from "./parse";

// JSON Feed 1.0 / 1.1 (https://jsonfeed.org). Detect with looksLikeJsonFeed before calling.
export function looksLikeJsonFeed(body: string): boolean {
  return /^\s*\{[\s\S]{0,400}"version"\s*:\s*"https:\/\/jsonfeed\.org\/version\/1(\.1)?"/.test(body.replace(/^﻿/, ""));
}

type J = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseJsonFeed(body: string, ctx: { feedUrl: string; fetchedAt: number }): Omit<ParsedFeed, "format"> & { format: "jsonfeed" } {
  let doc: J;
  try {
    doc = JSON.parse(body.replace(/^﻿/, "")) as J;
  } catch {
    throw new FeedParseError("NOT_XML", "The JSON could not be read.");
  }
  if (!str(doc.version)?.startsWith("https://jsonfeed.org/version/1")) {
    throw new FeedParseError("NOT_A_FEED", "This JSON is not a JSON Feed.");
  }
  const base = { baseUrl: ctx.feedUrl, fetchedAt: ctx.fetchedAt };
  const items: NormalizedItem[] = [];
  const raw = Array.isArray(doc.items) ? (doc.items as J[]).slice(0, MAX_ITEMS_PER_FETCH) : [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    try {
      const authors = Array.isArray(it.authors) ? (it.authors as J[]) : it.author ? [it.author as J] : [];
      const n = normalizeItem(
        {
          guid: str(it.id) ?? (typeof it.id === "number" ? String(it.id) : null),
          title: str(it.title),
          link: str(it.url) ?? str(it.external_url),
          author: authors.length ? str(authors[0]?.name) : null,
          published: str(it.date_published) ?? str(it.date_modified),
          contentHtml: str(it.content_html) ?? (str(it.content_text) ? escapeHtml(str(it.content_text)!) : null) ?? str(it.summary),
        },
        base,
      );
      if (n) items.push(n);
    } catch {
      continue; // one bad item never fails the feed
    }
  }
  return {
    format: "jsonfeed",
    title: cleanText(str(doc.title) ?? "") || new URL(ctx.feedUrl).hostname,
    siteUrl: toHttpUrl(str(doc.home_page_url), ctx.feedUrl),
    description: cleanText(str(doc.description) ?? "") || null,
    iconUrl: toHttpUrl(str(doc.icon) ?? str(doc.favicon), ctx.feedUrl),
    items,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
