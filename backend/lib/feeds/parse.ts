import { XMLParser } from "fast-xml-parser";
import { decodeHTML } from "entities";
import { cleanText, normalizeItem, toHttpUrl, type NormalizedItem, type RawItem } from "./normalize";

export type FeedFormat = "rss090" | "rss091" | "rss092" | "rss2" | "rss1" | "atom";

export interface ParsedFeed {
  format: FeedFormat;
  title: string;
  siteUrl: string | null;
  description: string | null;
  iconUrl: string | null;
  items: NormalizedItem[];
}

export class FeedParseError extends Error {
  constructor(public code: "NOT_XML" | "NOT_A_FEED" | "EMPTY", message: string) {
    super(message);
    this.name = "FeedParseError";
  }
}

export const MAX_ITEMS_PER_FETCH = 200;

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "__cdata", // keep CDATA apart: it is raw HTML and must not be entity-decoded
  parseTagValue: false, // keep every value as a string
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false, // SECURITY: never expand DOCTYPE entities (billion laughs); we decode text ourselves
  htmlEntities: false,
  stopNodes: ["*.content", "*.summary"], // Atom bodies stay raw so inline XHTML survives
  isArray: (name) => ["item", "entry", "link", "category", "author"].includes(name),
});

export function parseFeed(xml: string, ctx: { feedUrl: string; fetchedAt: number }): ParsedFeed {
  const body = xml.replace(/^﻿/, "").trimStart();
  if (!body.startsWith("<")) throw new FeedParseError("NOT_XML", "The response is not XML.");

  let doc: Node;
  try {
    doc = parser.parse(body) as Node;
  } catch (e) {
    throw new FeedParseError("NOT_XML", `The XML could not be read: ${(e as Error).message}`);
  }

  if (isNode(doc.rss)) {
    const rss = doc.rss;
    const version = String(rss["@_version"] ?? "2.0");
    const format: FeedFormat = version === "0.91" ? "rss091" : /^0\.9[2-4]$/.test(version) ? "rss092" : "rss2";
    const channel = first(rss.channel);
    if (!channel) throw new FeedParseError("NOT_A_FEED", "RSS document has no <channel>.");
    return buildRss(channel, toArray(channel.item), format, ctx);
  }

  const rdf = doc["rdf:RDF"] ?? doc["RDF:RDF"] ?? doc.RDF;
  if (isNode(rdf)) {
    const ns = String(rdf["@_xmlns"] ?? "");
    const format: FeedFormat = ns.includes("my.netscape.com/rdf/simple/0.9") ? "rss090" : "rss1";
    const channel = first(rdf.channel) ?? {};
    // RSS 0.90 and 1.0 put <item> beside <channel>; a few feeds nest them inside it.
    const items = [...toArray(rdf.item), ...toArray(channel.item)];
    return buildRss(channel, items, format, ctx);
  }

  if (isNode(doc.feed)) return buildAtom(doc.feed, ctx);

  if (doc.html || doc["!doctype"]) throw new FeedParseError("NOT_A_FEED", "This is a web page, not a feed.");
  throw new FeedParseError("NOT_A_FEED", "No RSS, RDF or Atom root element found.");
}

function buildRss(channel: Node, rawItems: Node[], format: FeedFormat, ctx: { feedUrl: string; fetchedAt: number }): ParsedFeed {
  const siteUrl = toHttpUrl(firstText(channel.link), ctx.feedUrl);
  const base = { baseUrl: ctx.feedUrl, fetchedAt: ctx.fetchedAt };
  const items: NormalizedItem[] = [];

  for (const raw of rawItems.slice(0, MAX_ITEMS_PER_FETCH)) {
    try {
      const guidNode = raw.guid;
      const permalink = !isNode(guidNode) || String(guidNode["@_isPermaLink"] ?? "true") !== "false"; // RSS default is true
      const guid = text(guidNode) ?? text(raw["@_rdf:about"]);
      const link = firstText(raw.link) ?? (permalink && guid?.startsWith("http") ? guid : null);
      const item: RawItem = {
        guid,
        title: text(raw.title),
        link,
        author: firstText(raw["dc:creator"]) ?? firstText(raw.author),
        published: text(raw.pubDate) ?? text(raw["dc:date"]) ?? text(raw.date),
        contentHtml: html(raw["content:encoded"]) ?? html(raw.description),
      };
      const n = normalizeItem(item, base);
      if (n) items.push(n);
    } catch {
      continue; // one bad item never fails the feed
    }
  }

  const image = first(channel.image);
  return {
    format,
    title: cleanText(text(channel.title) ?? "") || hostOf(ctx.feedUrl),
    siteUrl,
    description: cleanText(text(channel.description) ?? "") || null,
    iconUrl: image ? toHttpUrl(text(image.url), ctx.feedUrl) : null,
    items,
  };
}

function buildAtom(feed: Node, ctx: { feedUrl: string; fetchedAt: number }): ParsedFeed {
  const base = { baseUrl: ctx.feedUrl, fetchedAt: ctx.fetchedAt };
  const items: NormalizedItem[] = [];

  for (const raw of toArray(feed.entry).slice(0, MAX_ITEMS_PER_FETCH)) {
    try {
      const authors = toArray(raw.author);
      const item: RawItem = {
        guid: text(raw.id),
        title: atomText(raw.title),
        link: atomLink(raw.link, ctx.feedUrl),
        author: authors.length ? text(authors[0].name) : null,
        published: text(raw.published) ?? text(raw.updated) ?? text(raw.issued),
        contentHtml: atomBody(raw.content) ?? atomBody(raw.summary),
      };
      const n = normalizeItem(item, base);
      if (n) items.push(n);
    } catch {
      continue;
    }
  }

  return {
    format: "atom",
    title: cleanText(atomText(feed.title) ?? "") || hostOf(ctx.feedUrl),
    siteUrl: atomLink(feed.link, ctx.feedUrl),
    description: cleanText(atomText(feed.subtitle) ?? "") || null,
    iconUrl: toHttpUrl(text(feed.icon) ?? text(feed.logo), ctx.feedUrl),
    items,
  };
}

// ---------- helpers ----------

function isNode(v: unknown): v is Node {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toArray(v: unknown): Node[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => (isNode(x) ? x : { "#text": x }));
}

function first(v: unknown): Node | undefined {
  return toArray(v)[0];
}

// Text content of an element: entity-decoded #text plus raw CDATA.
function text(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" || typeof v === "number") return decodeHTML(String(v)).trim() || null;
  if (Array.isArray(v)) return text(v[0]);
  if (isNode(v)) {
    const parts: string[] = [];
    if (v["#text"] !== undefined) parts.push(decodeHTML(String(v["#text"])));
    for (const c of [v.__cdata].flat()) if (c !== undefined) parts.push(String(c));
    const s = parts.join("").trim();
    return s || null;
  }
  return null;
}

function firstText(v: unknown): string | null {
  for (const n of toArray(v)) {
    const t = text(n);
    if (t) return t;
  }
  return null;
}

// RSS description / content:encoded: escaped HTML decodes to markup, CDATA is already markup.
function html(v: unknown): string | null {
  return text(v);
}

// Atom title/subtitle: type="text" | "html" | "xhtml".
function atomText(v: unknown): string | null {
  const n = first(v);
  if (!n) return null;
  return text(n);
}

// Atom content/summary are stop nodes: their inner markup arrives as one raw string.
function atomBody(v: unknown): string | null {
  const n = first(v);
  if (!n) return null;
  const type = String(n["@_type"] ?? "text").toLowerCase();
  let raw = String(n["#text"] ?? "");
  raw = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  if (type === "xhtml" || type.endsWith("+xml") || type === "application/xhtml+xml") {
    return raw.replace(/^\s*<div[^>]*>([\s\S]*)<\/div>\s*$/i, "$1").trim() || null; // raw markup, unwrap the xhtml div
  }
  // "html" is escaped markup; "text" is plain text that must not be read as markup.
  const decoded = decodeHTML(raw).trim();
  if (!decoded) return null;
  return type === "text" ? escapeHtml(decoded) : decoded;
}

function atomLink(v: unknown, base: string): string | null {
  const links = toArray(v);
  const rel = (l: Node) => String(l["@_rel"] ?? "alternate");
  const pick =
    links.find((l) => rel(l) === "alternate" && String(l["@_type"] ?? "text/html").includes("html")) ??
    links.find((l) => rel(l) === "alternate") ??
    links.find((l) => typeof l["#text"] === "string"); // some feeds write <link>url</link>
  if (!pick) return null;
  return toHttpUrl(String(pick["@_href"] ?? pick["#text"] ?? ""), base);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "Untitled feed";
  }
}
