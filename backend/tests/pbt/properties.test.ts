// @vitest-environment node
// Property-based tests (fast-check), as promised in the project docs.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { FeedParseError, parseFeed } from "../../lib/feeds/parse";
import { exportOpml, parseOpml, type OpmlFeed } from "../../lib/feeds/opml";
import { isBlockedIp } from "../../lib/security/ssrf";

const ctx = { feedUrl: "https://example.com/feed", fetchedAt: Date.UTC(2026, 10, 8) };

describe("parser properties", () => {
  it("never throws anything but FeedParseError on arbitrary input", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (s) => {
        try {
          parseFeed(s, ctx);
        } catch (e) {
          expect(e).toBeInstanceOf(FeedParseError);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("every parsed item has a guid and a title, whatever the item fields contain", () => {
    const field = fc.oneof(fc.constant(""), fc.string({ maxLength: 60 }).map((s) => s.replace(/[<&]/g, " ")));
    fc.assert(
      fc.property(fc.array(fc.record({ title: field, link: field, guid: field, desc: field }), { maxLength: 8 }), (items) => {
        const xml = `<rss version="2.0"><channel><title>T</title>${items
          .map((i) => `<item><title>${i.title}</title><link>${i.link}</link><guid>${i.guid}</guid><description>${i.desc}</description></item>`)
          .join("")}</channel></rss>`;
        const feed = parseFeed(xml, ctx);
        for (const it of feed.items) {
          expect(it.guid.length).toBeGreaterThan(0);
          expect(it.title.length).toBeGreaterThan(0);
          expect(it.link === null || /^https?:\/\//.test(it.link)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("OPML properties", () => {
  it("export then import returns the same feeds", () => {
    const text = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim() === s && s.trim().length > 0 && !/[\u0000-\u001f]/.test(s));
    const feed = fc.record({
      title: text,
      feedUrl: fc.webUrl({ validSchemes: ["https"] }),
      siteUrl: fc.option(fc.webUrl({ validSchemes: ["https"] }), { nil: null }),
      folder: fc.option(text, { nil: null }),
    });
    fc.assert(
      fc.property(fc.uniqueArray(feed, { selector: (f) => f.feedUrl, maxLength: 10 }), (feeds: OpmlFeed[]) => {
        const back = parseOpml(exportOpml(feeds));
        const key = (f: OpmlFeed) => f.feedUrl;
        expect([...back].sort((a, b) => key(a).localeCompare(key(b)))).toEqual([...feeds].sort((a, b) => key(a).localeCompare(key(b))));
      }),
      { numRuns: 100 },
    );
  });
});

describe("SSRF properties", () => {
  const octet = fc.integer({ min: 0, max: 255 });
  it("blocks every generated private IPv4 address and its IPv4-mapped IPv6 form", () => {
    const priv = fc.oneof(
      fc.tuple(octet, octet, octet).map(([b, c, d]) => `10.${b}.${c}.${d}`),
      fc.tuple(fc.integer({ min: 16, max: 31 }), octet, octet).map(([b, c, d]) => `172.${b}.${c}.${d}`),
      fc.tuple(octet, octet).map(([c, d]) => `192.168.${c}.${d}`),
      fc.tuple(octet, octet, octet).map(([b, c, d]) => `127.${b}.${c}.${d}`),
      fc.tuple(octet, octet).map(([c, d]) => `169.254.${c}.${d}`),
    );
    fc.assert(
      fc.property(priv, (ip) => {
        expect(isBlockedIp(ip)).toBe(true);
        expect(isBlockedIp(`::ffff:${ip}`)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});
