import { decodeHTML } from "entities";
import type { SafeFetchResult } from "../security/ssrf";
import { looksLikeJsonFeed } from "./jsonfeed";

export type Fetcher = (url: string) => Promise<SafeFetchResult>;

export interface DiscoveredFeed {
  feedUrl: string;
  title: string | null;
}

const FEED_TYPES = /^application\/(rss|atom|rdf)\+xml$|^application\/xml$|^text\/xml$|^application\/(feed\+)?json$/i;
const COMMON_PATHS = ["/feed", "/rss", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml", "/feed/", "/?feed=rss2", "/feeds/posts/default"];
const MAX_PROBES = 6;

// True when the body is an RSS, RDF or Atom document, whatever the Content-Type says.
export function looksLikeFeed(body: string): boolean {
  const start = body.replace(/^﻿/, "").slice(0, 2048).replace(/<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/gi, "").trimStart();
  return /^<(rss|feed|rdf:RDF|RDF)\b/i.test(start);
}

export async function discoverFeeds(pageUrl: string, fetcher: Fetcher): Promise<DiscoveredFeed[]> {
  const page = await fetcher(pageUrl);
  if (looksLikeFeed(page.body) || looksLikeJsonFeed(page.body)) return [{ feedUrl: page.url, title: null }];

  const found = parseAlternateLinks(page.body, page.url);
  if (found.length) return found;

  // No <link rel="alternate">: probe common feed paths on the site root.
  const root = new URL(page.url);
  for (const path of COMMON_PATHS.slice(0, MAX_PROBES)) {
    const candidate = new URL(path, root.origin).toString();
    try {
      const res = await fetcher(candidate);
      if (looksLikeFeed(res.body) || looksLikeJsonFeed(res.body)) return [{ feedUrl: res.url, title: null }];
    } catch {
      continue;
    }
  }
  return [];
}

export function parseAlternateLinks(html: string, baseUrl: string): DiscoveredFeed[] {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd === -1 ? html.slice(0, 100_000) : html.slice(0, headEnd);
  const out: DiscoveredFeed[] = [];
  const seen = new Set<string>();

  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const attrs = readAttrs(tag);
    const rel = (attrs.rel ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("alternate") || !FEED_TYPES.test(attrs.type ?? "") || !attrs.href) continue;
    try {
      const feedUrl = new URL(decodeHTML(attrs.href), baseUrl).toString();
      if (seen.has(feedUrl)) continue;
      seen.add(feedUrl);
      out.push({ feedUrl, title: attrs.title ? decodeHTML(attrs.title) : null });
    } catch {
      continue;
    }
  }
  // Prefer the main feed over comment feeds.
  return out.sort((a, b) => Number(/comment/i.test(a.feedUrl)) - Number(/comment/i.test(b.feedUrl)));
}

function readAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}
