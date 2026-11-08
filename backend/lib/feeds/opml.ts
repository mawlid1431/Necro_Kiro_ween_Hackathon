import { XMLParser } from "fast-xml-parser";
import { decodeXML } from "entities";

export interface OpmlFeed {
  title: string;
  feedUrl: string;
  siteUrl: string | null;
  folder: string | null;
}

export const OPML_MAX_FEEDS = 200;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false, // no DOCTYPE entity expansion; attributes are decoded below
  isArray: (name) => name === "outline",
});

export function parseOpml(xml: string): OpmlFeed[] {
  const doc = parser.parse(xml.replace(/^﻿/, ""));
  const body = doc?.opml?.body;
  // An empty <body></body> parses as "" and is valid (zero feeds), so test for presence, not truthiness.
  if (body === undefined || body === null) throw new Error("This file is not OPML: it has no <body>.");

  const feeds: OpmlFeed[] = [];
  const seen = new Set<string>();

  const walk = (outlines: Record<string, unknown>[] | undefined, folder: string | null) => {
    for (const o of outlines ?? []) {
      if (feeds.length >= OPML_MAX_FEEDS) return;
      const attr = (k: string) => (typeof o[`@_${k}`] === "string" ? decodeXML(o[`@_${k}`] as string).trim() : "");
      const xmlUrl = attr("xmlUrl") || attr("xmlurl");
      if (xmlUrl) {
        if (!seen.has(xmlUrl) && /^https?:\/\//i.test(xmlUrl)) {
          seen.add(xmlUrl);
          feeds.push({ title: attr("title") || attr("text") || xmlUrl, feedUrl: xmlUrl, siteUrl: attr("htmlUrl") || null, folder });
        }
      } else if (o.outline) {
        // An outline without xmlUrl is a folder. Nested folders keep the innermost name.
        walk(o.outline as Record<string, unknown>[], attr("text") || attr("title") || folder);
      }
    }
  };

  walk(body.outline, null);
  return feeds;
}

export function exportOpml(feeds: OpmlFeed[], ownerName = "Necro user"): string {
  const line = (f: OpmlFeed, pad: string) =>
    `${pad}<outline type="rss" text="${esc(f.title)}" title="${esc(f.title)}" xmlUrl="${esc(f.feedUrl)}"${f.siteUrl ? ` htmlUrl="${esc(f.siteUrl)}"` : ""}/>`;

  const loose = feeds.filter((f) => !f.folder).map((f) => line(f, "    "));
  const folders = new Map<string, OpmlFeed[]>();
  for (const f of feeds) if (f.folder) folders.set(f.folder, [...(folders.get(f.folder) ?? []), f]);
  const grouped = [...folders].map(
    ([name, list]) => `    <outline text="${esc(name)}" title="${esc(name)}">\n${list.map((f) => line(f, "      ")).join("\n")}\n    </outline>`,
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<opml version="2.0">`,
    `  <head>`,
    `    <title>Necro subscriptions</title>`,
    `    <ownerName>${esc(ownerName)}</ownerName>`,
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    `  </head>`,
    `  <body>`,
    ...grouped,
    ...loose,
    `  </body>`,
    `</opml>`,
    ``,
  ].join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
