import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Data model: build prompt "Data model", merged with the original scaffold.
// Kept from the scaffold because the UI or the Clerk sync already uses them:
//   users.tokenIdentifier (+ by_token), users.createdAt, graves.status "dormant" (the UI's name for sleeping).
// Every table except `users` carries `userId` and an index that starts with it,
// so every query can be scoped to the caller (see convex/lib/auth.ts).

export const graveStatus = v.union(v.literal("alive"), v.literal("dormant"), v.literal("broken"));
export const platform = v.union(v.literal("linkedin"), v.literal("x"), v.literal("instagram"));
export const aiTask = v.union(v.literal("seance"), v.literal("resurrect"), v.literal("doctor"), v.literal("ask"), v.literal("briefing"), v.literal("voice"), v.literal("omen"), v.literal("opinion"), v.literal("grimoire"));
export const COLLECTION_TOPICS = ["ai", "security", "dev", "design", "science", "business", "news", "creators", "other"] as const;
export const collectionTopic = v.union(
  v.literal("ai"), v.literal("security"), v.literal("dev"), v.literal("design"), v.literal("science"),
  v.literal("business"), v.literal("news"), v.literal("creators"), v.literal("other"),
);
export const draftStatus =v.union(v.literal("draft"), v.literal("copied"), v.literal("shared"));

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(), // Clerk identity as Convex sees it (issuer|subject)
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    interests: v.array(v.string()),
    onboardedAt: v.optional(v.number()),
    createdAt: v.number(),
    timezone: v.optional(v.string()), // IANA, e.g. "Asia/Kuala_Lumpur"
    briefingHour: v.optional(v.number()), // 0-23, default 7
    summaryLanguage: v.optional(v.string()), // default "English"
    publicSlug: v.optional(v.string()), // random; set only when publishing is on
    isDemo: v.optional(v.boolean()), // demo account: AI reads from demoCache
    displayName: v.optional(v.string()), // public name on shared collections (never the email)
    privateMode: v.optional(v.boolean()), // every AI task skips providers that may train on prompts
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_clerk", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_publicSlug", ["publicSlug"]),

  graves: defineTable({
    userId: v.id("users"),
    feedUrl: v.string(), // normalised: lowercase host, no fragment
    siteUrl: v.optional(v.string()),
    title: v.string(),
    customTitle: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    folder: v.optional(v.string()),
    format: v.optional(v.string()), // rss090 | rss091 | rss092 | rss1 | rss2 | atom
    status: graveStatus,
    etag: v.optional(v.string()),
    lastModified: v.optional(v.string()),
    lastFetchedAt: v.optional(v.number()),
    lastNewItemAt: v.optional(v.number()),
    nextFetchAt: v.number(),
    failureCount: v.number(),
    lastErrorCode: v.optional(v.string()), // DNS | HTTP_404 | NOT_A_FEED | TIMEOUT | TOO_LARGE | BLOCKED | PARSE ...
    lastErrorDetail: v.optional(v.string()),
    doctorNote: v.optional(v.string()), // cached AI explanation of lastErrorCode
    doctorNoteFor: v.optional(v.string()), // the error code the note was written for
    unreadCount: v.number(),
    hubUrl: v.optional(v.string()), // WebSub hub declared by the feed
    selfUrl: v.optional(v.string()), // WebSub topic (rel="self")
    websubSecret: v.optional(v.string()), // per-subscription HMAC secret
    websubLeaseUntil: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_feedUrl", ["userId", "feedUrl"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_folder", ["userId", "folder"])
    .index("by_nextFetch", ["nextFetchAt"]),

  items: defineTable({
    userId: v.id("users"),
    graveId: v.id("graves"),
    guid: v.string(),
    title: v.string(),
    link: v.optional(v.string()),
    author: v.optional(v.string()),
    publishedAt: v.number(),
    contentHtml: v.string(), // already sanitised
    excerpt: v.string(), // plain text, max 300 chars
    isRead: v.boolean(),
    isStarred: v.boolean(),
    score: v.optional(v.number()), // copied from the Séance for sorting
    risenAt: v.number(), // when Necro first saw it
    fullHtml: v.optional(v.string()), // Exhume result, sanitised, max 200 KB
    exhumedAt: v.optional(v.number()),
    kindredId: v.optional(v.string()), // same story reported by several feeds
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_grave_guid", ["graveId", "guid"])
    .index("by_grave_published", ["graveId", "publishedAt"])
    .index("by_grave_read", ["graveId", "isRead", "publishedAt"])
    .index("by_grave_starred", ["graveId", "isStarred", "publishedAt"])
    .index("by_user_published", ["userId", "publishedAt"])
    .index("by_user_read", ["userId", "isRead", "publishedAt"])
    .index("by_user_starred", ["userId", "isStarred", "publishedAt"])
    .index("by_user_score", ["userId", "score"])
    .index("by_grave_score", ["graveId", "score"])
    .index("by_user_read_score", ["userId", "isRead", "score"])
    .index("by_user_starred_score", ["userId", "isStarred", "score"])
    .index("by_user_risen", ["userId", "risenAt"])
    .index("by_kindred", ["kindredId"])
    .searchIndex("search_text", { searchField: "title", filterFields: ["userId", "graveId"] })
    // 768 = Gemini embedding with a reduced output size; change with AI_EMBED_MODEL if needed.
    .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 768, filterFields: ["userId"] }),

  // Light per-item rows (titles only) so Kindred clustering never reads article HTML.
  // Only the last 48 h matter; rows are trimmed after a week and deleted with their item.
  kindredIndex: defineTable({
    userId: v.id("users"),
    itemId: v.id("items"),
    graveId: v.id("graves"),
    title: v.string(),
    publishedAt: v.number(),
    kindredId: v.optional(v.string()),
  })
    .index("by_user_published", ["userId", "publishedAt"])
    .index("by_item", ["itemId"]),

  omens: defineTable({
    userId: v.id("users"),
    topic: v.string(), // 3-60 chars, what the reader watches
    keywords: v.array(v.string()), // pre-filter words derived from the topic
    strict: v.boolean(), // strict: only AI-confirmed matches, never keyword-only ones
    muted: v.boolean(),
    matchCount: v.number(),
    lastMatchAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  omenMatches: defineTable({
    userId: v.id("users"),
    omenId: v.id("omens"),
    itemId: v.id("items"),
    reason: v.string(),
    via: v.union(v.literal("ai"), v.literal("keyword")),
    seen: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user_seen", ["userId", "seen", "createdAt"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_omen", ["omenId", "createdAt"])
    .index("by_omen_item", ["omenId", "itemId"])
    .index("by_item", ["itemId"]),

  // Second Opinion: one comparison per Kindred group per user. Sources are labelled S1..S4.
  opinions: defineTable({
    userId: v.id("users"),
    kindredId: v.string(),
    itemIds: v.array(v.id("items")), // the sources compared, sorted: a changed group gets a fresh comparison
    sources: v.array(v.object({ label: v.string(), itemId: v.id("items"), feed: v.string(), title: v.string(), key: v.array(v.string()) })),
    agree: v.array(v.object({ point: v.string(), sources: v.array(v.string()) })),
    differ: v.array(v.object({ point: v.string(), views: v.array(v.object({ source: v.string(), says: v.string() })) })),
    onlyOne: v.array(v.object({ claim: v.string(), source: v.string() })),
    model: v.string(), // "ghost:side-by-side" when no AI answered
  }).index("by_user_kindred", ["userId", "kindredId"]),

  // Grimoire: weekly newsletter drafts, kept as history. Markdown is rendered on the server.
  grimoires: defineTable({
    userId: v.id("users"),
    weekOf: v.string(), // UTC date the draft was composed, e.g. "2026-11-09"
    title: v.string(),
    markdown: v.string(),
    itemIds: v.array(v.id("items")),
    model: v.string(), // "ghost:template" when no AI answered
    updatedAt: v.number(),
  }).index("by_user", ["userId", "updatedAt"]),

  seances: defineTable({
    userId: v.id("users"),
    itemId: v.id("items"),
    summary: v.array(v.string()),
    score: v.number(),
    reason: v.string(),
    model: v.string(), // "ghost:extractive" when no model answered
  })
    .index("by_item", ["itemId"])
    .index("by_user", ["userId"]),

  drafts: defineTable({
    userId: v.id("users"),
    itemId: v.id("items"),
    platform,
    text: v.string(),
    hashtags: v.array(v.string()),
    status: draftStatus,
    model: v.string(),
  })
    .index("by_item", ["itemId"])
    .index("by_user", ["userId"]),

  voice: defineTable({
    userId: v.id("users"),
    tone: v.string(),
    audience: v.string(),
    wordsToUse: v.array(v.string()),
    wordsToAvoid: v.array(v.string()),
    samplePosts: v.array(v.string()), // max 3, each max 2000 chars
  }).index("by_user", ["userId"]),

  apiKeys: defineTable({
    userId: v.id("users"),
    name: v.string(),
    hash: v.string(), // sha256 of the raw key; the raw key is never stored
    prefix: v.string(), // first 8 chars after "necro_sk_", shown in Settings
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_revoked", ["userId", "revokedAt"])
    .index("by_hash", ["hash"]),

  aiUsage: defineTable({
    userId: v.id("users"),
    task: aiTask,
    model: v.string(), // "pending" until the call finishes
    inputTokens: v.number(),
    outputTokens: v.number(),
    day: v.string(), // UTC date, e.g. "2026-11-08"
  }).index("by_user_day_task", ["userId", "day", "task"]),

  rateLimits: defineTable({
    key: v.string(), // e.g. "mcp:<apiKeyId>" or "summon:<userId>"
    windowStart: v.number(),
    count: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_windowStart", ["windowStart"]),

  voiceSessions: defineTable({
    userId: v.id("users"),
    seconds: v.number(),
    day: v.string(), // UTC date
  }).index("by_user_day", ["userId", "day"]),

  briefings: defineTable({
    userId: v.id("users"),
    day: v.string(), // the user's local date
    headline: v.string(),
    body: v.string(),
    picks: v.array(v.id("items")),
    model: v.string(),
  }).index("by_user_day", ["userId", "day"]),

  // Circuit breaker per AI provider (not per user).
  providerHealth: defineTable({
    provider: v.string(),
    state: v.union(v.literal("closed"), v.literal("open"), v.literal("half_open")),
    failures: v.number(),
    windowStart: v.number(),
    openedUntil: v.number(),
    cooldownMs: v.number(),
    lastStatus: v.optional(v.number()),
  }).index("by_provider", ["provider"]),

  // Pre-computed AI answers for the demo account (instant, identical video takes).
  demoCache: defineTable({ key: v.string(), value: v.string() }).index("by_key", ["key"]),

  // ---------- Covens: shared feed collections (spec: .kiro/specs/covens) ----------
  // A collection stores a SNAPSHOT of feed URLs, never grave ids, so followers never touch the
  // curator's private rows. Public-by-design fields only: no read state, stars, drafts or email.
  collections: defineTable({
    userId: v.id("users"),
    slug: v.string(), // 10 random chars, used in links
    title: v.string(),
    description: v.string(),
    topic: collectionTopic,
    visibility: v.union(v.literal("public"), v.literal("unlisted")),
    feeds: v.array(v.object({ feedUrl: v.string(), title: v.string(), siteUrl: v.optional(v.string()) })),
    starredFeed: v.boolean(), // curator opted in to an RSS feed of their starred posts
    followerCount: v.number(),
    subscribeCount: v.number(),
    reportCount: v.number(),
    hidden: v.boolean(), // hidden from Discover after 3 reports
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_slug", ["slug"])
    .index("by_public_new", ["visibility", "hidden"]) // newest first via _creationTime
    .index("by_public_topic_new", ["visibility", "hidden", "topic"])
    .index("by_public_followers", ["visibility", "hidden", "followerCount"])
    .index("by_public_topic", ["visibility", "hidden", "topic", "followerCount"])
    .searchIndex("search_title", { searchField: "title", filterFields: ["visibility", "hidden", "topic"] }),

  collectionFollows: defineTable({ userId: v.id("users"), collectionId: v.id("collections") })
    .index("by_user", ["userId"])
    .index("by_collection", ["collectionId"])
    .index("by_user_collection", ["userId", "collectionId"]),

  collectionReports: defineTable({ userId: v.id("users"), collectionId: v.id("collections"), reason: v.string() })
    .index("by_user", ["userId"])
    .index("by_collection", ["collectionId"])
    .index("by_user_collection", ["userId", "collectionId"]),
});
