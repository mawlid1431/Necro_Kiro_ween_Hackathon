// Demo people for the Circle, so a fresh database (and the hackathon demo) has someone to follow.
// Internal only (CLI / dashboard): `npx convex run seedCircle:seed`. Every account is marked isDemo and named "(demo)".
// `npx convex run seedCircle:post '{"slug":"..."}'` adds one new post, to watch it arrive live in Following.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { Topic } from "../lib/topics";

type DemoPost = { platform: "linkedin" | "x"; text: string; title: string; link: string; feedTitle: string; feedUrl: string; topic: Topic; hoursAgo: number };

const PEOPLE: { name: string; slug: string; bio: string; interests: string[]; posts: DemoPost[] }[] = [
  {
    name: "Ada Okafor (demo)",
    slug: "ada-okafor-demo",
    bio: "Reads AI research so you don't have to. Shares the useful 10%.",
    interests: ["AI agents", "machine learning"],
    posts: [
      { platform: "linkedin", text: "Simon Willison's notes on running models locally are the clearest guide I have read this month. The key point: small models are now good enough for most summarising jobs.", title: "Running LLMs on your own laptop", link: "https://simonwillison.net/", feedTitle: "Simon Willison's Weblog", feedUrl: "https://simonwillison.net/atom/everything/", topic: "ai", hoursAgo: 3 },
      { platform: "x", text: "Hugging Face explains how they evaluate open models, with the actual numbers. Worth bookmarking.", title: "How we evaluate open models", link: "https://huggingface.co/blog", feedTitle: "Hugging Face Blog", feedUrl: "https://huggingface.co/blog/feed.xml", topic: "ai", hoursAgo: 26 },
    ],
  },
  {
    name: "Sam Rivera (demo)",
    slug: "sam-rivera-demo",
    bio: "Security engineer. Patch notes, breaches and how to not be next.",
    interests: ["web security", "privacy"],
    posts: [
      { platform: "linkedin", text: "Krebs on Security walks through how this phishing kit bypassed MFA. If your team still uses SMS codes, read this today.", title: "Phishing kits that beat MFA", link: "https://krebsonsecurity.com/", feedTitle: "Krebs on Security", feedUrl: "https://krebsonsecurity.com/feed/", topic: "security", hoursAgo: 5 },
    ],
  },
  {
    name: "Lena Park (demo)",
    slug: "lena-park-demo",
    bio: "Product designer writing about type, colour and calm interfaces.",
    interests: ["typography", "UX design"],
    posts: [
      { platform: "linkedin", text: "Smashing Magazine's piece on accessible colour contrast has a checklist I now use on every review.", title: "Accessible colour, step by step", link: "https://www.smashingmagazine.com/", feedTitle: "Smashing Magazine", feedUrl: "https://www.smashingmagazine.com/feed/", topic: "design", hoursAgo: 30 },
    ],
  },
];

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    for (const p of PEOPLE) {
      const existing = await ctx.db.query("users").withIndex("by_publicSlug", (q) => q.eq("publicSlug", p.slug)).first();
      if (existing) continue;
      const userId = await ctx.db.insert("users", {
        tokenIdentifier: `demo|${p.slug}`,
        clerkId: `demo_${p.slug}`,
        name: p.name,
        displayName: p.name,
        interests: p.interests,
        createdAt: now,
        isDemo: true,
        profilePublic: true,
        publicSlug: p.slug,
        bio: p.bio,
        followerCount: 0,
        followingCount: 0,
        sharedCount: 0,
      });
      for (const post of p.posts) await insertPost(ctx, userId, post, now - post.hoursAgo * 3_600_000);
      created++;
    }
    return { created };
  },
});

/** One new post for a demo person, right now: shows up live in every follower's Following tab. */
export const post = internalMutation({
  args: { slug: v.string(), text: v.optional(v.string()) },
  handler: async (ctx, { slug, text }) => {
    const u = await ctx.db.query("users").withIndex("by_publicSlug", (q) => q.eq("publicSlug", slug)).first();
    if (!u?.isDemo) throw new Error("Only demo accounts can be posted for.");
    const base = PEOPLE.find((p) => p.slug === slug)?.posts[0];
    if (!base) throw new Error("Unknown demo account.");
    await insertPost(ctx, u._id, { ...base, text: text ?? `New: ${base.text}` }, Date.now());
    return { ok: true };
  },
});

async function insertPost(ctx: import("./_generated/server").MutationCtx, userId: Id<"users">, p: DemoPost, at: number) {
  const publishId = await ctx.db.insert("publishes", { userId, kind: "manual", platform: p.platform, status: "posted", createdAt: at, at, finishedAt: at, text: p.text, note: "demo" });
  await ctx.db.insert("sharedPosts", {
    userId, publishId, platform: p.platform, text: p.text, itemTitle: p.title, itemLink: p.link, feedTitle: p.feedTitle, feedUrl: p.feedUrl, topic: p.topic, postedAt: at,
  });
  const u = await ctx.db.get(userId);
  if (u) await ctx.db.patch(userId, { sharedCount: (u.sharedCount ?? 0) + 1, lastSharedAt: Math.max(u.lastSharedAt ?? 0, at) });
}
