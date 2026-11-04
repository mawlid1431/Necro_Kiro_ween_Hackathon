import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireUser } from "./lib/auth";

/** Create or refresh the caller's user record. Called once after sign-in. */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in");

    const existing = await getCurrentUser(ctx);
    if (existing) {
      if (existing.name !== identity.name || existing.email !== identity.email) {
        await ctx.db.patch(existing._id, { name: identity.name, email: identity.email });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkId: identity.subject,
      name: identity.name,
      email: identity.email,
      interests: [],
      createdAt: Date.now(),
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return { _id: user._id, name: user.name, email: user.email, interests: user.interests };
  },
});

export const ensureSignedIn = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return true;
  },
});
