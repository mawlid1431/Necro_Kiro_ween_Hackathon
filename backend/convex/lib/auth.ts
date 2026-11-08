import { ConvexError } from "convex/values";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { ErrorCode } from "../../lib/errors";

// The single user-isolation helper. Every Convex function that touches user
// data resolves the caller here and never trusts a userId from the client.

type Ctx = QueryCtx | MutationCtx;

/** Throws the error contract shape the UI reads from `error.data.code`. */
export function fail(code: ErrorCode, message: string): never {
  throw new ConvexError({ code, message });
}

export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail("UNAUTHENTICATED", "Please sign in.");
  const user = await getCurrentUser(ctx);
  if (!user) fail("UNAUTHENTICATED", "Your account is still being set up. Refresh in a moment.");
  return user;
}

type OwnedTable = Exclude<TableNames, "users" | "rateLimits">;

/**
 * Load a record by id and return it only if it belongs to `userId`.
 * Someone else's record is reported exactly like a missing one, so ids
 * cannot be probed across accounts.
 */
export async function getOwned<T extends OwnedTable>(
  ctx: Ctx,
  userId: Id<"users">,
  id: Id<T>,
): Promise<Doc<T> | null> {
  const doc = await ctx.db.get(id);
  if (!doc) return null;
  // Every OwnedTable has a required userId (convex/schema.ts), but TypeScript
  // cannot see that through the generic table name.
  const ownerId = (doc as unknown as { userId: Id<"users"> }).userId;
  return ownerId === userId ? doc : null;
}

/** Like getOwned, but throws NOT_FOUND (same message for missing and foreign rows). */
export async function requireOwned<T extends OwnedTable>(
  ctx: Ctx,
  userId: Id<"users">,
  id: Id<T>,
): Promise<Doc<T>> {
  const doc = await getOwned(ctx, userId, id);
  if (!doc) fail("NOT_FOUND", "That could not be found.");
  return doc;
}

/** Constant-time-ish comparison for server secrets (MCP route, voice agent). */
export function assertSecret(given: string, envName: "MCP_SERVER_SECRET" | "AGENT_SERVER_SECRET"): void {
  const expected = process.env[envName];
  if (!expected || expected.length < 32) fail("FORBIDDEN", "Server secret is not configured.");
  let diff = given.length ^ expected.length;
  for (let i = 0; i < Math.max(given.length, expected.length); i++) {
    diff |= (given.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  if (diff !== 0) fail("FORBIDDEN", "Forbidden.");
}

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}
