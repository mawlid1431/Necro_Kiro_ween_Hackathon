import { ConvexError } from "convex/values";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// The single user-isolation helper. Every Convex function that touches user
// data resolves the caller here and never trusts a userId from the client.

type Ctx = QueryCtx | MutationCtx;

export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new ConvexError("Not signed in");
  return user;
}

type OwnedTable = Exclude<TableNames, "users">;

/**
 * Load a record by id and return it only if it belongs to `user`.
 * Someone else's record is reported exactly like a missing one, so ids
 * cannot be probed across accounts.
 */
export async function getOwned<T extends OwnedTable>(
  ctx: Ctx,
  user: Doc<"users">,
  id: Id<T>,
): Promise<Doc<T> | null> {
  const doc = await ctx.db.get(id);
  if (!doc) return null;
  // Every OwnedTable has a required userId (convex/schema.ts), but TypeScript
  // cannot see that through the generic table name.
  const ownerId = (doc as unknown as { userId: Id<"users"> }).userId;
  return ownerId === user._id ? doc : null;
}
