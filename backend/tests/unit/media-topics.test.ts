import { describe, expect, it } from "vitest";
import { firstBodyImage, pickImage, safeImageUrl } from "../../lib/feeds/image";
import { parseFeed } from "../../lib/feeds/parse";
import { parseJsonFeed } from "../../lib/feeds/jsonfeed";
import { classifyTopic, topicsOfInterests } from "../../lib/topics";
import { modelLabel } from "../../lib/ai/modelName";

const ctx = { feedUrl: "https://example.com/feed.xml", fetchedAt: Date.UTC(2026, 10, 23) };
const BASE = "https://example.com/post";

describe("safeImageUrl", () => {
  it("keeps https, upgrades http, resolves relative paths", () => {
    expect(safeImageUrl("https://cdn.example.com/a.jpg", BASE)).toBe("https://cdn.example.com/a.jpg");
    expect(safeImageUrl("http://cdn.example.com/a.jpg", BASE)).toBe("https://cdn.example.com/a.jpg");
    expect(safeImageUrl("/img/a.png", BASE)).toBe("https://example.com/img/a.png");
  });
  it("rejects data:, javascript:, credentials and tracking pixels", () => {
    expect(safeImageUrl("data:image/png;base64,AAAA", BASE)).toBeNull();
    expect(safeImageUrl("javascript:alert(1)", BASE)).toBeNull();
    expect(safeImageUrl("https://u:p@cdn.example.com/a.jpg", BASE)).toBeNull();
    expect(safeImageUrl("https://example.com/pixel.gif", BASE)).toBeNull();
    expect(safeImageUrl("https://feeds.feedburner.com/~r/x/~4/abc", BASE)).toBeNull();
  });
  it("does not mistake a real file name for a pixel", () => {
    expect(safeImageUrl("https://example.com/blank-canvas.jpg", BASE)).toBe("https://example.com/blank-canvas.jpg");
  });
});

describe("pickImage", () => {
  it("prefers media:content over a thumbnail even when only the thumbnail declares a width", () => {
    const url = pickImage(
      [
        { url: "https://x.com/thumb.jpg", medium: "image", width: 150, priority: 1 },
        { url: "https://x.com/full.jpg", medium: "image", priority: 0 },
      ],
      "",
      BASE,
    );
    expect(url).toBe("https://x.com/full.jpg");
  });
  it("picks the widest image of the same source", () => {
    const url = pickImage(
      [
        { url: "https://x.com/small.jpg", medium: "image", width: 320, priority: 0 },
        { url: "https://x.com/large.jpg", medium: "image", width: 1200, priority: 0 },
      ],
      "",
      BASE,
    );
    expect(url).toBe("https://x.com/large.jpg");
  });
  it("skips video enclosures and falls back to the first real body image", () => {
    const body = '<p><img src="https://x.com/pixel.gif" width="1" height="1"><img src="https://x.com/hero.png" width="800"></p>';
    expect(firstBodyImage(body)?.url).toBe("https://x.com/hero.png");
    expect(pickImage([{ url: "https://x.com/v.mp4", type: "video/mp4", priority: 2 }], body, BASE)).toBe("https://x.com/hero.png");
  });
  it("returns null when there is no image at all", () => {
    expect(pickImage([], "<p>Just words.</p>", BASE)).toBeNull();
  });
});

describe("feed parsing keeps images and categories", () => {
  it("RSS with Media RSS and categories", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>T</title>
      <item><title>OpenAI ships a new reasoning model</title><link>https://example.com/a</link>
        <category>Artificial Intelligence</category>
        <media:content url="https://cdn.example.com/a-large.jpg" medium="image" width="1200"/>
        <media:thumbnail url="https://cdn.example.com/a-thumb.jpg" width="150"/>
        <description>Short text.</description></item></channel></rss>`;
    const [item] = parseFeed(xml, ctx).items;
    expect(item.imageUrl).toBe("https://cdn.example.com/a-large.jpg");
    expect(item.topic).toBe("ai");
  });
  it("RSS image enclosure", () => {
    const xml = `<rss version="2.0"><channel><title>T</title><item><title>A</title><link>https://example.com/a</link>
      <enclosure url="http://cdn.example.com/e.png" type="image/png" length="1"/></item></channel></rss>`;
    expect(parseFeed(xml, ctx).items[0].imageUrl).toBe("https://cdn.example.com/e.png");
  });
  it("Atom enclosure link and category term", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title><entry><id>1</id><title>Patch now: critical CVE in OpenSSH</title>
      <link href="https://example.com/a"/><link rel="enclosure" type="image/jpeg" href="https://cdn.example.com/s.jpg"/>
      <category term="security"/><updated>2026-11-20T00:00:00Z</updated></entry></feed>`;
    const [item] = parseFeed(xml, ctx).items;
    expect(item.imageUrl).toBe("https://cdn.example.com/s.jpg");
    expect(item.topic).toBe("security");
  });
  it("JSON Feed image and tags", () => {
    const json = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "T",
      items: [{ id: "1", url: "https://example.com/a", title: "Figma adds a new design system tool", image: "https://cdn.example.com/j.webp", tags: ["design"] }],
    });
    const [item] = parseJsonFeed(json, ctx).items;
    expect(item.imageUrl).toBe("https://cdn.example.com/j.webp");
    expect(item.topic).toBe("design");
  });
});

describe("classifyTopic", () => {
  const cases: [string, string, string][] = [
    ["Anthropic releases a faster Claude model for coding agents", "", "ai"],
    ["Ransomware gang exploits zero-day in VPN appliances", "", "security"],
    ["TypeScript 6.0 is out with a faster compiler", "", "dev"],
    ["Why typography matters in user interface design", "", "design"],
    ["NASA telescope spots water on a distant planet", "", "science"],
    ["Fintech startup raises $40M Series B", "", "business"],
    ["Parliament passes new election law after protests", "", "news"],
    ["How I grew my newsletter to 10,000 subscribers on Substack", "", "creators"],
    ["A quiet walk by the river", "Some thoughts on autumn.", "other"],
  ];
  for (const [title, excerpt, want] of cases) {
    it(`${want}: ${title}`, () => expect(classifyTopic({ title, excerpt })).toBe(want));
  }
  it("never matches 'ai' inside other words", () => {
    expect(classifyTopic({ title: "She said the train was late again", excerpt: "Details remain unclear." })).toBe("other");
  });
  it("feed categories weigh more than a passing word", () => {
    expect(classifyTopic({ categories: ["Security"], title: "What we learned this week", excerpt: "A short note about our new API." })).toBe("security");
  });
  it("maps free-text interests to topics", () => {
    expect(topicsOfInterests(["AI agents", "web security", "typography", "gardening"]).sort()).toEqual(["ai", "design", "security"]);
  });
});


describe("modelLabel", () => {
  it.each([
    ["groq:llama-3.3-70b-versatile", "Llama 3.3 70B · Groq"],
    ["openrouter:google/gemma-4-26b-a4b-it", "Gemma 4 26B A4B · OpenRouter"],
    ["openrouter:google/gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite · OpenRouter"],
    ["openrouter:meta-llama/llama-3.3-70b-instruct:free", "Llama 3.3 70B (free) · OpenRouter"],
    ["openrouter:openrouter/free", "Free model router · OpenRouter"],
    ["groq:openai/gpt-oss-120b", "GPT OSS 120B · Groq"],
    ["mock:seance", "Test model"],
  ])("%s", (spec, want) => expect(modelLabel(spec)).toBe(want));
  it("Ghost mode has no model", () => {
    expect(modelLabel("ghost:extractive")).toBeNull();
    expect(modelLabel(undefined)).toBeNull();
  });
});

describe("classifyTopic: tech and gadgets", () => {
  it.each([
    ["Apple's AirPods Pro 3 are 40 percent off ahead of Black Friday", "tech"],
    ["How one router caused the worst ground stop since 9/11", "tech"],
    ["Building a wireless network adapter for the Super Nintendo", "tech"],
    ["Nvidia unveils a new AI chip for training large language models", "ai"],
    ["You can't afford to keep your SSH keys on disk", "security"],
    ["GTA 6 building personal behavioral profile for every player", "tech"],
    ["CollectWise (YC F24) Is Hiring", "business"],
    ["Blade Runner 2099 is an inventive twist on a cyberpunk classic", "other"],
  ])("%s -> %s", (title, want) => expect(classifyTopic({ title })).toBe(want));
});
