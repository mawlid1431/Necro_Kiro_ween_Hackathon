// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FeedParseError, parseFeed } from "../../lib/feeds/parse";
import { parseFeedDate, normalizeItem } from "../../lib/feeds/normalize";
import { exportOpml, parseOpml } from "../../lib/feeds/opml";
import { looksLikeFeed, parseAlternateLinks } from "../../lib/feeds/discover";
import { sanitizeArticle } from "../../lib/sanitize";
import { normaliseFeedUrl, withScheme } from "../../lib/feeds/url";

const ctx = { feedUrl: "https://example.com/feed", fetchedAt: Date.UTC(2026, 10, 8) };

const RSS2 = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Example &amp; Co</title><link>https://example.com/</link><description>News</description>
  <item>
    <title>First post</title><link>/posts/1</link><guid isPermaLink="false">post-1</guid>
    <pubDate>Sat, 07 Nov 2026 10:00:00 GMT</pubDate><dc:creator>Ada</dc:creator>
    <content:encoded><![CDATA[<p>Hello <script>alert(1)</script><a href="javascript:x()">bad</a> <img src="/a.png" onerror="x()"></p>]]></content:encoded>
  </item>
  <item><title>No date</title><link>https://example.com/posts/2</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Atom Blog</title>
  <link href="https://atom.example/" rel="alternate"/><link href="https://atom.example/feed" rel="self"/>
  <entry>
    <id>tag:atom.example,2026:1</id><title>Entry one</title>
    <link href="https://atom.example/1" rel="alternate" type="text/html"/>
    <updated>2026-11-01T12:00:00Z</updated><author><name>Grace</name></author>
    <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Inline <b>XHTML</b></p></div></content>
  </entry>
</feed>`;

const RSS1 = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://rdf.example/"><title>RDF Site</title><link>https://rdf.example/</link></channel>
  <item rdf:about="https://rdf.example/a"><title>RDF item</title><link>https://rdf.example/a</link><dc:date>2026-10-01</dc:date></item>
</rdf:RDF>`;

describe("parseFeed", () => {
  it("parses RSS 2.0, sanitises content and resolves relative links", () => {
    const f = parseFeed(RSS2, ctx);
    expect(f.format).toBe("rss2");
    expect(f.title).toBe("Example & Co");
    expect(f.items).toHaveLength(2);
    const [a, b] = f.items;
    expect(a.guid).toBe("post-1");
    expect(a.link).toBe("https://example.com/posts/1");
    expect(a.author).toBe("Ada");
    expect(a.contentHtml).not.toMatch(/script|javascript:|onerror/);
    expect(a.contentHtml).toContain('src="https://example.com/a.png"');
    expect(b.hasDate).toBe(false);
    expect(b.publishedAt).toBe(ctx.fetchedAt);
    expect(b.guid).toBe("https://example.com/posts/2"); // falls back to link
  });

  it("parses Atom with inline XHTML", () => {
    const f = parseFeed(ATOM, ctx);
    expect(f.format).toBe("atom");
    expect(f.siteUrl).toBe("https://atom.example/");
    expect(f.items[0].contentHtml).toContain("<b>XHTML</b>");
    expect(f.items[0].author).toBe("Grace");
  });

  it("parses RSS 1.0 (RDF)", () => {
    const f = parseFeed(RSS1, ctx);
    expect(f.format).toBe("rss1");
    expect(f.items[0].title).toBe("RDF item");
  });

  it("rejects HTML pages and non-XML with FeedParseError", () => {
    expect(() => parseFeed("<!DOCTYPE html><html><body>hi</body></html>", ctx)).toThrow(FeedParseError);
    expect(() => parseFeed("{json:true}", ctx)).toThrow(FeedParseError);
  });

  it("does not expand DOCTYPE entities (billion laughs)", () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]>
      <rss version="2.0"><channel><title>&lol2;</title></channel></rss>`;
    const f = parseFeed(bomb, ctx);
    expect(f.title.length).toBeLessThan(50);
  });
});

describe("normalize", () => {
  it("parses common date formats", () => {
    expect(parseFeedDate("Sat, 07 Nov 2026 10:00:00 GMT")).toBe(Date.UTC(2026, 10, 7, 10));
    expect(parseFeedDate("2026-11-07T10:00:00Z")).toBe(Date.UTC(2026, 10, 7, 10));
    expect(parseFeedDate("2026-11-07 10:00")).not.toBeNull();
    expect(parseFeedDate("Samstag, 07 Nov 2026 10:00:00 PST")).toBe(Date.UTC(2026, 10, 7, 18));
    expect(parseFeedDate("0001-01-01T00:00:00Z")).toBeNull();
    expect(parseFeedDate("not a date")).toBeNull();
  });

  it("gives a stable hash guid when there is no guid or link", () => {
    const raw = { title: "Same", contentHtml: "<p>Body</p>" };
    const a = normalizeItem(raw, { baseUrl: "https://x.test/", fetchedAt: 1 });
    const b = normalizeItem(raw, { baseUrl: "https://x.test/", fetchedAt: 999_999 });
    expect(a?.guid).toMatch(/^h:/);
    expect(a?.guid).toBe(b?.guid);
  });

  it("drops items with nothing to show", () => {
    expect(normalizeItem({}, { baseUrl: "https://x.test/", fetchedAt: 1 })).toBeNull();
  });
});

describe("OPML", () => {
  const opml = `<?xml version="1.0"?><opml version="2.0"><body>
    <outline text="Tech"><outline text="A" xmlUrl="https://a.test/feed" htmlUrl="https://a.test"/>
      <outline text="Dup" xmlUrl="https://a.test/feed"/></outline>
    <outline text="B &amp; C" xmlUrl="https://b.test/rss"/>
    <outline text="Bad" xmlUrl="file:///etc/passwd"/>
  </body></opml>`;

  it("parses nested folders, dedupes and drops non-http URLs", () => {
    const feeds = parseOpml(opml);
    expect(feeds).toEqual([
      { title: "A", feedUrl: "https://a.test/feed", siteUrl: "https://a.test", folder: "Tech" },
      { title: "B & C", feedUrl: "https://b.test/rss", siteUrl: null, folder: null },
    ]);
  });

  it("round-trips through export", () => {
    const feeds = parseOpml(opml);
    expect(parseOpml(exportOpml(feeds))).toEqual(feeds);
  });

  it("rejects files without a body", () => {
    expect(() => parseOpml("<opml></opml>")).toThrow();
  });
});

describe("discovery", () => {
  it("finds alternate links and prefers the main feed over comments", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed">
      <link rel="alternate" type="application/atom+xml" title="Main" href="/feed.atom">
      <link rel="stylesheet" href="/s.css"></head><body></body></html>`;
    const found = parseAlternateLinks(html, "https://site.test/blog/");
    expect(found.map((f) => f.feedUrl)).toEqual(["https://site.test/feed.atom", "https://site.test/comments/feed"]);
  });

  it("sniffs feeds regardless of content type", () => {
    expect(looksLikeFeed(`<?xml version="1.0"?>\n<!-- hi --><rss version="2.0">`)).toBe(true);
    expect(looksLikeFeed("<feed xmlns='http://www.w3.org/2005/Atom'>")).toBe(true);
    expect(looksLikeFeed("<!doctype html><html>")).toBe(false);
  });
});

describe("sanitizeArticle", () => {
  it("strips active content and hardens links", () => {
    const out = sanitizeArticle(
      `<iframe src="https://evil.test"></iframe><a href="/x" onclick="steal()">x</a><img src="data:image/png;base64,AAA"><style>body{}</style>`,
      "https://site.test/",
    );
    expect(out).toBe('<a href="https://site.test/x" rel="noopener noreferrer nofollow" target="_blank">x</a>');
  });
});

describe("feed URL helpers", () => {
  it("normalises for dedupe", () => {
    expect(normaliseFeedUrl("https://EXAMPLE.com/feed/#top")).toBe("https://example.com/feed");
    expect(normaliseFeedUrl("https://example.com/")).toBe("https://example.com/");
    expect(withScheme("example.com")).toBe("https://example.com");
    expect(withScheme("http://example.com")).toBe("http://example.com");
  });
});
