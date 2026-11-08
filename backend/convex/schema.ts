import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Data model: build prompt "Data model", merged with the original scaffold.
// Kept from the scaffold because the UI or the Clerk sync already uses them:
//   users.tokenIdentifier (+ by_token), users.createdAt, graves.status "dormant" (the UI's name for sleeping).
// Every table except `users` carries `userId` and an index that starts with it,
// so every query can be scoped to the caller (see convex/lib/auth.ts).

export const graveStatus = v.union(v.literal("alive"), v.literal("dormant"), v.literal("broken"));
export const platform = v.union(v.literal("linkedin"), v.literal("x"), v.literal("instagram"));
export const aiTask = v.union(v.literal("seance"), v.literal("resurrect"), v.literal("doctor"), v.literal("voice"));
export const draftStatus = v.union(v.literal("draft"), v.literal("copied"), v.literal("shared"));

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(), // Clerk identity as Convex sees it (issuer|subject)
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    interests: v.array(v.string()),
    onboardedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_clerk", ["clerkId"]),

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
  })
    .index("by_grave_guid", ["graveId", "guid"])
    .index("by_grave_published", ["graveId", "publishedAt"])
    .index("by_grave_read", ["graveId", "isRead", "publishedAt"])
    .index("by_grave_starred", ["graveId", "isStarred", "publishedAt"])
    .index("by_user_published", ["userId", "publishedAt"])
    .index("by_user_read", ["userId", "isRead", "publishedAt"])
    .index("by_user_starred", ["userId", "isStarred", "publishedAt"])
    .index("by_user_score", ["userId", "score"])
    .index("by_user_risen", ["userId", "risenAt"])
    .searchIndex("search_text", { searchField: "title", filterFields: ["userId", "graveId"] }),

  seances: defineTable({
    userId: v.id("users"),
    itemId: v.id("items"),
    summary: v.array(v.string()),
    score: v.number(),
    reason: v.string(),
    model: v.string(),
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
});
