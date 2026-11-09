"use node";
// Covens actions that touch the network: one-click subscribe and curated starter collections.
import { ConvexError, v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { checkUrl, safeFetch } from "../lib/security/ssrf";
import { parseAnyFeed } from "../lib/feeds/any";
import { normaliseFeedUrl } from "../lib/feeds/url";

type SubscribeResult = { created: number; duplicates: number; skipped: number; collection: string };

/** "Summon all": adds every feed of a collection you don't have yet. The poller fetches them, so this returns at once. */
export const subscribeAll = action({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<SubscribeResult> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    const c = await ctx.runQuery(internal.covens.forSubscribe, { slug });
    if (!c) throw new ConvexError({ code: "NOT_FOUND", message: "That collection could not be found." });

    // Re-check every URL with the SSRF guard: a collection is user content.
    let blocked = 0;
    const feeds = [];
    for (const f of c.feeds) {
      try {
        checkUrl(f.feedUrl);
        feeds.push({ title: f.title, feedUrl: f.feedUrl, siteUrl: f.siteUrl, folder: c.title.slice(0, 60) });
      } catch {
        blocked++;
      }
    }
    const r = await ctx.runMutation(internal.graves.createMany, { userId, feeds });
    await ctx.runMutation(internal.covens.recordSubscribe, { userId, collectionId: c._id });
    if (r.created) await ctx.runMutation(internal.graves.pollDue, {}); // start fetching now, not in 5 minutes
    return { created: r.created, duplicates: r.duplicates, skipped: r.skipped + blocked, collection: c.title };
  },
});

// Curated starter collections so Discover is useful from the first visit. Every feed is fetched and
// parsed before it is published; a feed that fails today is simply left out.
const STARTERS: { slug: string; title: string; description: string; topic: "ai" | "security" | "dev" | "science" | "news" | "creators"; urls: string[] }[] = [
  {
    slug: "starter-ai",
    title: "AI & machine learning",
    description: "Research, tools and honest commentary on AI, from builders and labs.",
    topic: "ai",
    urls: ["https://simonwillison.net/atom/everything/", "https://huggingface.co/blog/feed.xml", "https://deepmind.google/blog/rss.xml", "https://www.technologyreview.com/topic/artificial-intelligence/feed", "https://the-decoder.com/feed/"],
  },
  {
    slug: "starter-security",
    title: "Security daily",
    description: "Breaches, vulnerabilities and defence, from trusted security writers.",
    topic: "security",
    urls: ["https://krebsonsecurity.com/feed/", "https://www.schneier.com/feed/atom/", "https://feeds.feedburner.com/TheHackersNews", "https://www.bleepingcomputer.com/feed/"],
  },
  {
    slug: "starter-webdev",
    title: "Web development",
    description: "Frontend, platforms and the craft of building for the web.",
    topic: "dev",
    urls: ["https://github.blog/feed/", "https://www.smashingmagazine.com/feed/", "https://overreacted.io/rss.xml", "https://web.dev/feed.xml", "https://dev.to/feed"],
  },
  {
    slug: "starter-science",
    title: "Science, explained",
    description: "Discoveries in physics, biology and space, written for curious people.",
    topic: "science",
    urls: ["https://www.quantamagazine.org/feed/", "https://www.sciencedaily.com/rss/top/science.xml", "https://www.nasa.gov/feed/"],
  },
  {
    slug: "starter-tech-news",
    title: "Tech news",
    description: "The day's technology headlines from established newsrooms.",
    topic: "news",
    urls: ["https://www.theverge.com/rss/index.xml", "https://feeds.arstechnica.com/arstechnica/index", "https://feeds.bbci.co.uk/news/technology/rss.xml", "https://hnrss.org/frontpage"],
  },
  {
    slug: "starter-creators",
    title: "For creators",
    description: "Writing, audience and the creator economy, for people who share what they learn.",
    topic: "creators",
    urls: ["https://www.platformer.news/rss/", "https://seths.blog/feed/", "https://austinkleon.com/feed/", "https://www.lennysnewsletter.com/feed", "https://every.to/feed"],
  },
];

/** Run with: bunx convex run covensNode:seedStarters */
export const seedStarters = internalAction({
  args: {},
  handler: async (ctx) => {
    const userId = await ctx.runMutation(internal.covens.upsertCurator, {});
    const report: { slug: string; kept: number; dropped: string[] }[] = [];
    for (const s of STARTERS) {
      const feeds: { feedUrl: string; title: string; siteUrl?: string }[] = [];
      const dropped: string[] = [];
      for (const url of s.urls) {
        try {
          const res = await safeFetch(url, { timeoutMs: 8_000 });
          const feed = parseAnyFeed(res.body, { feedUrl: res.url, fetchedAt: Date.now() });
          if (!feed.items.length) throw new Error("empty");
          feeds.push({ feedUrl: normaliseFeedUrl(res.url), title: feed.title.slice(0, 200), siteUrl: feed.siteUrl ?? undefined });
        } catch {
          dropped.push(url);
        }
      }
      if (feeds.length >= 2) {
        await ctx.runMutation(internal.covens.upsertStarter, { userId, slug: s.slug, title: s.title, description: s.description, topic: s.topic, feeds });
      }
      report.push({ slug: s.slug, kept: feeds.length, dropped });
    }
    return report;
  },
});
