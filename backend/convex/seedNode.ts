"use node";
// Seed (Final Draft 8.6): 8 feeds covering every format Necro supports, plus a broken one
// for Feed Doctor. Idempotent: re-running reports duplicates instead of adding twice.
//
//   bun run seed                                  -> built-in demo user
//   bun run seed -- '{"email":"you@example.com"}' -> your account (sign in once first)
//   bun run seed -- '{"apiKey":true}'             -> also prints an MCP key for that user, once
import { createHash, randomInt } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { summonFor } from "./feedsNode";

const FEEDS: { url: string; kind: string }[] = [
  { url: "https://hnrss.org/frontpage", kind: "RSS 2.0" },
  { url: "https://www.theverge.com/rss/index.xml", kind: "Atom" },
  { url: "https://rss.slashdot.org/Slashdot/slashdotMain", kind: "RSS 1.0 (RDF)" },
  { url: "https://www.jsonfeed.org/feed.json", kind: "JSON Feed" },
  { url: "https://medium.com/feed/netflix-techblog", kind: "WebSub hub declared" },
  { url: "https://simonwillison.net/", kind: "website (discovery)" },
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", kind: "excerpt-only (Exhume)" },
  { url: "https://www.google.com/necro-no-such-feed.xml", kind: "broken (Feed Doctor)" },
];

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

interface SeedReport {
  user: string;
  userCreated: boolean;
  feeds: { kind: string; url: string; result: string }[];
  graves: { title: string; status: string; format: string; unread: number; error: string | null }[];
  mcpKey?: string;
  note?: string;
}

export const run = internalAction({
  args: { email: v.optional(v.string()), apiKey: v.optional(v.boolean()) },
  handler: async (ctx, { email, apiKey }): Promise<SeedReport> => {
    const who: { userId: Id<"users">; label: string; created: boolean } = await ctx.runMutation(internal.seed.resolveUser, { email });
    await ctx.runMutation(internal.seed.ensureProfile, { userId: who.userId });

    const feeds: { kind: string; url: string; result: string }[] = [];
    for (const f of FEEDS) {
      try {
        const r = await summonFor(ctx, who.userId, f.url);
        feeds.push({ kind: f.kind, url: f.url, result: r.status === "summoned" ? `summoned "${r.title}" (${r.itemCount} items)` : "already there" });
      } catch (e) {
        const data = e instanceof ConvexError ? (e.data as { code?: string; message?: string }) : null;
        // Keep failing feeds as graves anyway, so Feed Doctor has something to diagnose.
        const made = await ctx.runMutation(internal.graves.createMany, {
          userId: who.userId,
          feeds: [{ title: `${f.kind} (failed to summon)`, feedUrl: f.url }],
        });
        if (made.created) await ctx.runMutation(internal.graves.pollDue, {}); // fetch now so it is marked with its error
        feeds.push({ kind: f.kind, url: f.url, result: `failed: ${data?.code ?? "ERROR"} ${data?.message ?? ""}`.trim() });
      }
    }

    let key: string | undefined;
    if (apiKey) {
      key = "necro_sk_" + Array.from({ length: 43 }, () => BASE62[randomInt(62)]).join("");
      await ctx.runMutation(internal.apiKeys.insert, {
        userId: who.userId,
        name: "Seed key",
        hash: createHash("sha256").update(key).digest("hex"),
        prefix: key.slice(0, 17),
      });
    }

    return {
      user: who.label,
      userCreated: who.created,
      feeds,
      graves: await ctx.runQuery(internal.seed.report, { userId: who.userId }),
      ...(key ? { mcpKey: key, note: "Shown once. Store it in your MCP client; only its hash is saved." } : {}),
    };
  },
});
