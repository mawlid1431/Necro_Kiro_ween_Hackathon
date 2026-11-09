import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { fail, getCurrentUser, requireOwned, requireUser } from "./lib/auth";
import { MAX_API_KEYS } from "../lib/limits";

// Personal MCP keys: "necro_sk_" + 32 random bytes in base62. Only the SHA-256 hash
// and a short prefix are stored; the raw key is returned once.
// Generated in an action with Web Crypto: action randomness is real, while
// mutation randomness is seeded and must not be used for secrets.

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const KEY_CHARS = 43; // 43 base62 chars carry ~256 bits, the same as 32 random bytes

/** Unbiased base62 string from a CSPRNG (rejection sampling: bytes >= 248 are discarded). */
function randomBase62(length: number): string {
  let out = "";
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < 248 && out.length < length) out += BASE62[b % 62];
    }
  }
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const create = action({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<{ key: string; prefix: string }> => {
    const userId = await ctx.runQuery(internal.users.currentId, {});
    const clean = name.trim().slice(0, 60) || "MCP key";
    const raw = `necro_sk_${randomBase62(KEY_CHARS)}`;
    const prefix = raw.slice(0, 17); // "necro_sk_" + 8 chars
    await ctx.runMutation(internal.apiKeys.insert, { userId, name: clean, hash: await sha256Hex(raw), prefix });
    return { key: raw, prefix };
  },
});

export const insert = internalMutation({
  args: { userId: v.id("users"), name: v.string(), hash: v.string(), prefix: v.string() },
  handler: async (ctx, args) => {
    const active = await ctx.db.query("apiKeys").withIndex("by_user_revoked", (q) => q.eq("userId", args.userId).eq("revokedAt", undefined)).take(MAX_API_KEYS);
    if (active.length >= MAX_API_KEYS) {
      fail("LIMIT", `You can have up to ${MAX_API_KEYS} active keys. Revoke one first.`);
    }
    await ctx.db.insert("apiKeys", args);
  },
});

/** Never returns the hash. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const keys = await ctx.db.query("apiKeys").withIndex("by_user", (q) => q.eq("userId", user._id)).order("desc").take(50);
    return keys.map((k) => ({
      _id: k._id,
      _creationTime: k._creationTime,
      name: k.name,
      prefix: k.prefix,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
    }));
  },
});

export const revoke = mutation({
  args: { keyId: v.id("apiKeys") },
  handler: async (ctx, { keyId }) => {
    const user = await requireUser(ctx);
    const key = await requireOwned(ctx, user._id, keyId);
    if (!key.revokedAt) await ctx.db.patch(keyId, { revokedAt: Date.now() });
  },
});
