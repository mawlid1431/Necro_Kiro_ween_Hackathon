import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Data model: docs/Necro_Project_Documentation.md section 7.
// Every table except `users` carries `userId` and an index that starts with it,
// so every query can be scoped to the caller (see convex/lib/auth.ts).

export const graveStatus = v.union(
  v.literal("alive"),
  v.literal("dormant"),
  v.literal("broken"),
);

export const platform = v.union(
  v.literal("linkedin"),
  v.literal("x"),
  v.literal("instagram"),
);

export default defineSchema({
  users: defineTable({
    // Clerk identity, stored as Convex's tokenIdentifier (issuer|subject).
    tokenIdentifier: v.string(),
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    interests: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_token", ["tokenIdentifier"]),

  graves: defineTable({
    userId: v.id("users"),
    feedUrl: v.string(),
    siteUrl: v.optional(v.string()),
    title: v.string(),
    iconUrl: v.optional(v.string()),
    status: graveStatus,
    etag: v.optional(v.string()),
    lastModified: v.optional(v.string()),
    lastFetchedAt: v.optional(v.number()),
    nextFetchAt: v.number(),
    errorCount: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_feedUrl", ["userId", "feedUrl"])
    .index("by_nextFetchAt", ["nextFetchAt"]),

  items: defineTable({
    userId: v.id("users"),
    graveId: v.id("graves"),
    guid: v.string(),
    title: v.string(),
    link: v.optional(v.string()),
    author: v.optional(v.string()),
    publishedAt: v.number(),
    contentHtml: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    isRead: v.boolean(),
    isStarred: v.boolean(),
    risenAt: v.number(),
  })
    .index("by_user_risenAt", ["userId", "risenAt"])
    .index("by_grave_guid", ["graveId", "guid"])
    .index("by_user_grave", ["userId", "graveId"]),

  seances: defineTable({
    userId: v.id("users"),
    itemId: v.id("items"),
    summary: v.array(v.string()),
    score: v.number(),
    reason: v.string(),
    model: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_item", ["itemId"]),

  drafts: defineTable({
    userId: v.id("users"),
    itemId: v.id("items"),
    platform,
    text: v.string(),
    hashtags: v.array(v.string()),
    status: v.union(v.literal("draft"), v.literal("copied"), v.literal("shared")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_item", ["userId", "itemId"]),

  voice: defineTable({
    userId: v.id("users"),
    tone: v.string(),
    audience: v.string(),
    wordsToUse: v.array(v.string()),
    wordsToAvoid: v.array(v.string()),
    samplePosts: v.array(v.string()),
  }).index("by_user", ["userId"]),

  apiKeys: defineTable({
    userId: v.id("users"),
    name: v.string(),
    hashedKey: v.string(),
    prefix: v.string(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_hashedKey", ["hashedKey"]),
});
