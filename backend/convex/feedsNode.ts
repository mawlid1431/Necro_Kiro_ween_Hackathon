"use node";
// Node actions for the feed engine: fetching (safeFetch), discovery, parsing, OPML.
// Database work lives in graves.ts and items.ts (a "use node" file may export only actions).
import { ConvexError, v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { checkUrl, safeFetch, SafeFetchError } from "../lib/security/ssrf";
import { discoverFeeds, looksLikeFeed } from "../lib/feeds/discover";
import { FeedParseError, parseFeed, type ParsedFeed } from "../lib/feeds/parse";
import { parseOpml } from "../lib/feeds/opml";
import { faviconFor, normaliseFeedUrl, withScheme } from "../lib/feeds/url";
import { clientCodeFor } from "../lib/errors";
import { MAX_GRAVES_PER_USER, SUMMONS_PER_HOUR } from "../lib/limits";

const INGEST_CHUNK = 20; // keeps each ingest mutation well under Convex write limits
const OPML_MAX_BYTES = 1024 * 1024;

type SummonResult =
  | { status: "summoned"; graveId: Id<"graves">; title: string; itemCount: number; alternatives: string[] }
  | { status: "duplicate"; graveId: Id<"graves"> };

/** Maps fetch and parse errors to the client error contract. Raw stack traces never reach the client. */
function toUserError(e: unknown): ConvexError<{ code: string; message: string }> {
  if (e instanceof ConvexError) return e;
  if (e instanceof SafeFetchError) return new ConvexError({ code: clientCodeFor(e.code), message: e.message });
  if (e instanceof FeedParseError) return new ConvexError({ code: "NOT_A_FEED", message: e.message });
  console.error("[summon] unexpected error:", e instanceof Error ? e.message : e);
  return new ConvexError({ code: "NOT_A_FEED", message: "That address did not return a feed." });
}

async function ingestAll(ctx: ActionCtx, userId: Id<"users">, graveId: Id<"graves">, feed: ParsedFeed, fetchedAt: number, firstFetch: boolean) {
  let inserted = 0;
  for (let i = 0; i < feed.items.length; i += INGEST_CHUNK) {
    const r = await ctx.runMutation(internal.items.ingest, {
      userId,
      graveId,
      items: feed.items.slice(i, i + INGEST_CHUNK),
      fetchedAt,
      firstFetch,
    });
    inserted += r.inserted;
  }
  return inserted;
}

/** Shared by the UI action, MCP add_grave and the voice agent. */
export async function summonFor(ctx: ActionCtx, userId: Id<"users">, url: string, folder?: string): Promise<SummonResult> {
  const input = withScheme(url);
  try {
    checkUrl(input); // fast, friendly error before any network call
  } catch (e) {
    throw toUserError(e);
  }

  const count = await ctx.runQuery(internal.graves.countForUser, { userId });
  if (count >= MAX_GRAVES_PER_USER) throw new ConvexError({ code: "LIMIT", message: "You have reached 300 feeds." });
  const allowed = await ctx.runMutation(internal.rateLimits.hit, { key: `summon:${userId}`, limit: SUMMONS_PER_HOUR, windowMs: 3_600_000 });
  if (!allowed) throw new ConvexError({ code: "LIMIT", message: "You can summon 30 feeds an hour. Try again soon." });

  const started = Date.now();
  try {
    let res = await safeFetch(input);
    let alternatives: string[] = [];
    if (!looksLikeFeed(res.body)) {
      const found = await discoverFeeds(res.url, (u) => safeFetch(u));
      if (!found.length) throw new ConvexError({ code: "NOT_A_FEED", message: "No feed found on that page." });
      alternatives = found.slice(1, 5).map((f) => f.feedUrl);
      res = await safeFetch(found[0].feedUrl);
    }

    const feedUrl = normaliseFeedUrl(res.url);
    const existing = await ctx.runQuery(internal.graves.byFeedUrl, { userId, feedUrl });
    if (existing) return { status: "duplicate", graveId: existing._id };

    const fetchedAt = Date.now();
    const feed = parseFeed(res.body, { feedUrl: res.url, fetchedAt });
    const graveId = await ctx.runMutation(internal.graves.create, {
      userId,
      feedUrl,
      siteUrl: feed.siteUrl ?? undefined,
      title: feed.title,
      iconUrl: feed.iconUrl ?? faviconFor(feed.siteUrl ?? res.url),
      folder: folder?.trim().slice(0, 60) || undefined,
      format: feed.format,
      etag: res.etag ?? undefined,
      lastModified: res.lastModified ?? undefined,
    });
    const inserted = await ingestAll(ctx, userId, graveId, feed, fetchedAt, true);
    console.log(JSON.stringify({ ev: "summon", graveId, ms: Date.now() - started, items: feed.items.length, inserted }));
    return { status: "summoned", graveId, title: feed.title, itemCount: feed.items.length, alternatives };
  } catch (e) {
    throw toUserError(e);
  }
}

export const summon = action({
  args: { url: v.string(), folder: v.optional(v.string()) },
  handler: async (ctx, { url, folder }): Promise<SummonResult> => {
    if (url.length > 2000) throw new ConvexError({ code: "INVALID_INPUT", message: "That URL is too long." });
    const userId = await ctx.runQuery(internal.users.currentId, {}); // throws if signed out
    return await summonFor(ctx, userId, url, folder);
  },
});

/** Internal entry for MCP and the voice agent (caller already resolved and checked the user). */
export const summonInternal = internalAction({
  args: { userId: v.id("users"), url: v.string(), folder: v.optional(v.string()) },
  handler: (ctx, { userId, url, folder }): Promise<SummonResult> => summonFor(ctx, userId, url, folder),
});

/** Creates up to 200 graves at once; the poller fetches them, so the UI never waits on 200 fetches. */
export const importOpml = action({
  args: { opml: v.string() },
  handler: async (ctx, { opml }): Promise<{ created: number; duplicates: number; skipped: number }> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    if (opml.length > OPML_MAX_BYTES) throw new ConvexError({ code: "INVALID_INPUT", message: "OPML files can be up to 1 MB." });
    let feeds;
    try {
      feeds = parseOpml(opml);
    } catch (e) {
      throw new ConvexError({ code: "INVALID_INPUT", message: e instanceof Error ? e.message : "That file is not OPML." });
    }
    // Drop URLs that safeFetch would refuse anyway (private hosts, bad ports).
    const valid = feeds.filter((f) => {
      try {
        checkUrl(f.feedUrl);
        return true;
      } catch {
        return false;
      }
    });
    const r = await ctx.runMutation(internal.graves.createMany, {
      userId,
      feeds: valid.map((f) => ({ title: f.title, feedUrl: f.feedUrl, siteUrl: f.siteUrl ?? undefined, folder: f.folder ?? undefined })),
    });
    return { ...r, skipped: r.skipped + (feeds.length - valid.length) };
  },
});

function errorCode(e: unknown): { code: string; detail: string } {
  if (e instanceof SafeFetchError) return { code: e.code, detail: e.message };
  if (e instanceof FeedParseError) return { code: e.code === "NOT_XML" && /could not be read/.test(e.message) ? "PARSE" : e.code, detail: e.message };
  return { code: "PARSE", detail: e instanceof Error ? e.message : "Unknown error" };
}

/** Polls one grave: conditional GET, parse, ingest, schedule the next fetch. */
export const fetchOne = internalAction({
  args: { graveId: v.id("graves") },
  handler: async (ctx, { graveId }): Promise<{ status: string; inserted: number; code?: string }> => {
    const grave = await ctx.runQuery(internal.graves.getInternal, { graveId });
    if (!grave) return { status: "gone", inserted: 0 };
    const started = Date.now();
    try {
      const res = await safeFetch(grave.feedUrl, { etag: grave.etag, lastModified: grave.lastModified });
      if (res.notModified) {
        const status = await ctx.runMutation(internal.graves.recordSuccess, { graveId, notModified: true });
        console.log(JSON.stringify({ ev: "fetch", graveId, status: 304, ms: Date.now() - started }));
        return { status: status ?? "gone", inserted: 0 };
      }
      const fetchedAt = Date.now();
      const feed = parseFeed(res.body, { feedUrl: res.url, fetchedAt });
      const inserted = await ingestAll(ctx, grave.userId, graveId, feed, fetchedAt, !grave.lastFetchedAt);
      const status = await ctx.runMutation(internal.graves.recordSuccess, {
        graveId,
        notModified: false,
        etag: res.etag ?? undefined,
        lastModified: res.lastModified ?? undefined,
        format: feed.format,
        title: feed.title,
        newFeedUrl: res.permanentRedirect ? normaliseFeedUrl(res.url) : undefined,
      });
      console.log(JSON.stringify({ ev: "fetch", graveId, status: res.status, ms: Date.now() - started, items: feed.items.length, inserted }));
      return { status: status ?? "gone", inserted };
    } catch (e) {
      const { code, detail } = errorCode(e);
      const status = await ctx.runMutation(internal.graves.recordFailure, { graveId, code, detail });
      console.log(JSON.stringify({ ev: "fetch", graveId, status: "error", code, ms: Date.now() - started }));
      return { status: status ?? "gone", inserted: 0, code };
    }
  },
});
