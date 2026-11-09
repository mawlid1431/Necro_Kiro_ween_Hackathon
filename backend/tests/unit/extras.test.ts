// @vitest-environment node
// Tests for the Final Draft modules (section 10.4), plus Ghost Resurrect and JSON Feed wiring.
import { test, expect } from "vitest";
import fc from "fast-check";
import { parseJsonFeed, looksLikeJsonFeed } from "../../lib/feeds/jsonfeed";
import { isFeedBody, parseAnyFeed } from "../../lib/feeds/any";
import { parseAlternateLinks } from "../../lib/feeds/discover";
import { ghostResurrect, ghostSeance } from "../../lib/ai/ghost";
import { clusterKindred } from "../../lib/ai/kindred";

const ctx = { feedUrl: "https://example.com/feed.json", fetchedAt: Date.UTC(2026, 10, 8) };

test("JSON Feed 1.1: items, html/text content, authors, dates", () => {
  const body = JSON.stringify({
    version: "https://jsonfeed.org/version/1.1", title: "JF &amp; co", home_page_url: "https://example.com/", icon: "/i.png",
    items: [
      { id: "1", url: "/p/1", title: "Hello", content_html: "<p>Hi <script>x()</script></p>", date_published: "2026-11-01T10:00:00Z", authors: [{ name: "Ana" }] },
      { id: 2, content_text: "plain <b>text</b>\nline two" },
      "junk",
    ],
  });
  expect(looksLikeJsonFeed(body)).toBe(true);
  const f = parseJsonFeed(body, ctx);
  expect(f.title).toBe("JF & co");
  expect(f.iconUrl).toBe("https://example.com/i.png");
  expect(f.items).toHaveLength(2);
  expect(f.items[0]).toMatchObject({ guid: "1", link: "https://example.com/p/1", author: "Ana", publishedAt: Date.parse("2026-11-01T10:00:00Z") });
  expect(f.items[0].contentHtml).toBe("<p>Hi </p>");
  expect(f.items[1].guid).toBe("2");
  expect(f.items[1].contentHtml).toContain("plain &lt;b&gt;text&lt;/b&gt;<br />line two");
  expect(looksLikeJsonFeed('{"version":"1"}')).toBe(false);
});

test("JSON Feed is detected and parsed through the shared entry points", () => {
  const body = JSON.stringify({ version: "https://jsonfeed.org/version/1", title: "J", items: [{ id: "a", title: "A" }] });
  expect(isFeedBody(body)).toBe(true);
  expect(parseAnyFeed(body, ctx).format).toBe("jsonfeed");
  expect(parseAnyFeed(`<rss version="2.0"><channel><title>R</title></channel></rss>`, ctx).format).toBe("rss2");
  const links = parseAlternateLinks(`<head><link rel="alternate" type="application/feed+json" href="/feed.json"></head>`, "https://s.test/");
  expect(links[0].feedUrl).toBe("https://s.test/feed.json");
});

test("ghost Séance: 3 bullets, bounded score, matches interests", () => {
  const text = "Researchers released a new open model for code security today. The model finds injection bugs in large repositories. It was trained on public vulnerability reports and audited by independent teams. Pricing was not announced. Critics say benchmarks are narrow and need review.";
  const s = ghostSeance({ title: "Open model finds security bugs", text, interests: ["security", "AI", "gardening"] });
  expect(s.summary).toHaveLength(3);
  expect(s.score).toBeGreaterThanOrEqual(0);
  expect(s.score).toBeLessThanOrEqual(100);
  expect(s.reason).toContain("security");
  expect(s.model).toBe("ghost:extractive");
});

test("ghost Séance keeps decimals inside sentences", () => {
  const text =
    "Qwen 3.8 27B running on my laptop can read model weights as well. It took 52 minutes on a 2.5 GHz machine to finish the run. The results match the paper closely enough to be useful.";
  const s = ghostSeance({ title: "Qwen 3.8 reads weights", text, interests: [] });
  expect(s.summary.some((b) => b.startsWith("Qwen 3.8 27B"))).toBe(true);
  expect(s.summary.every((b) => !/^\d/.test(b))).toBe(true); // no fragment that starts mid-number
});

test("ghost Séance never throws and always returns 3 bullets", () => {
  fc.assert(fc.property(fc.string({ maxLength: 400 }), fc.string({ maxLength: 2000 }), fc.array(fc.string({ maxLength: 20 }), { maxLength: 8 }), (title, text, interests) => {
    const s = ghostSeance({ title, text, interests });
    expect(s.summary).toHaveLength(3);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
  }));
});

test("ghost Resurrect always fits platform limits with 3 to 6 hashtags", () => {
  fc.assert(fc.property(
    fc.string({ maxLength: 500 }),
    fc.webUrl(),
    fc.array(fc.string({ maxLength: 300 }), { maxLength: 3 }),
    fc.array(fc.string({ maxLength: 20 }), { maxLength: 10 }),
    (title, link, summary, interests) => {
      const d = ghostResurrect({ title, link, summary, interests });
      expect(d.x.length).toBeLessThanOrEqual(280);
      expect(d.x.endsWith(link)).toBe(true);
      expect(d.linkedin.length).toBeLessThanOrEqual(1300);
      expect(d.instagram.length).toBeLessThanOrEqual(2200);
      expect(d.hashtags.length).toBeGreaterThanOrEqual(3);
      expect(d.hashtags.length).toBeLessThanOrEqual(6);
    },
  ));
});

test("kindred: same story across feeds clusters, same feed and old items do not", () => {
  const t = Date.UTC(2026, 10, 8);
  const groups = clusterKindred([
    { id: "a", graveId: "g1", title: "Apple announces new M6 MacBook Pro with longer battery", publishedAt: t },
    { id: "b", graveId: "g2", title: "New M6 MacBook Pro announced by Apple, battery longer", publishedAt: t + 3600_000 },
    { id: "c", graveId: "g3", title: "Gardening tips for the rainy season", publishedAt: t },
    { id: "d", graveId: "g1", title: "Apple announces new M6 MacBook Pro with longer battery life", publishedAt: t },
    { id: "e", graveId: "g4", title: "Apple announces new M6 MacBook Pro with longer battery", publishedAt: t - 5 * 86400_000 },
  ]);
  expect(groups.map((g: string[]) => g.sort())).toEqual([["a", "b"]]);
});
