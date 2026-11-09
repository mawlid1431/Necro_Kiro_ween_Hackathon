// Your voice (Settings): save, read back, update in place, limits, isolation, and use by Resurrect.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { resurrectPrompt } from "../../lib/ai/prompts";

const modules = import.meta.glob("../../convex/**/*.*s");

const founder = {
  tone: "direct, optimistic, honest",
  audience: "founders and builders",
  wordsToUse: ["we learned", "shipped", "shipped", " lesson "],
  wordsToAvoid: ["disrupt", "guru"],
  samplePosts: ["We shipped the new reader today. Lesson: small releases beat big ones.", "  ", ""],
};

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "v_alice", tokenIdentifier: "clerk|v_alice" });
  const bob = t.withIdentity({ subject: "v_bob", tokenIdentifier: "clerk|v_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  await bob.mutation(api.users.store, {});
  return { t, alice, bob, aliceId };
}

describe("your voice", () => {
  it("saves, cleans and reads back; a second save updates the same profile", async () => {
    const { t, alice } = await setup();
    expect(await alice.query(api.voice.get, {})).toBeNull();
    await alice.mutation(api.voice.save, founder);
    expect(await alice.query(api.voice.get, {})).toEqual({
      tone: "direct, optimistic, honest",
      audience: "founders and builders",
      wordsToUse: ["we learned", "shipped", "lesson"],
      wordsToAvoid: ["disrupt", "guru"],
      samplePosts: ["We shipped the new reader today. Lesson: small releases beat big ones."],
    });
    await alice.mutation(api.voice.save, { ...founder, tone: "warm, clear" });
    expect((await alice.query(api.voice.get, {}))?.tone).toBe("warm, clear");
    expect(await t.run((ctx) => ctx.db.query("voice").collect())).toHaveLength(1);
  });

  it("refuses oversized input and keeps each user's voice private", async () => {
    const { alice, bob } = await setup();
    await expect(alice.mutation(api.voice.save, { ...founder, samplePosts: ["a", "b", "c", "d"] })).rejects.toThrow(/up to 3 sample posts/);
    await expect(alice.mutation(api.voice.save, { ...founder, tone: "x".repeat(201) })).rejects.toThrow(/200 characters/);
    await alice.mutation(api.voice.save, founder);
    expect(await bob.query(api.voice.get, {})).toBeNull();
  });

  it("Resurrect receives the saved voice and puts it in the prompt", async () => {
    const { t, alice, aliceId } = await setup();
    await alice.mutation(api.voice.save, founder);
    const graveId = await t.mutation(internal.graves.create, { userId: aliceId, feedUrl: "https://a.test/rss", title: "Alpha" });
    await t.mutation(internal.items.ingest, {
      userId: aliceId,
      graveId,
      items: [{ guid: "1", title: "A post", link: "https://a.test/1", author: null, publishedAt: Date.now(), contentHtml: "<p>Body</p>", excerpt: "Body" }],
      fetchedAt: Date.now(),
      firstFetch: false,
    });
    const itemId = (await t.run((ctx) => ctx.db.query("items").first()))!._id;
    const c = await t.query(internal.drafts.context, { userId: aliceId, itemId });
    expect(c.voice?.tone).toBe("direct, optimistic, honest");
    const prompt = resurrectPrompt({ voice: c.voice, title: "A post", link: "https://a.test/1", source: "Alpha", summary: [], text: "Body" });
    expect(prompt).toContain("tone=direct, optimistic, honest");
    expect(prompt).toContain("avoid=disrupt, guru");
    expect(prompt).toContain("small releases beat big ones");
  });
});
