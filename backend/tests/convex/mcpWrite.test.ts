// MCP write tools: read-only vs "read and write" keys, server-side key checks, the app's posting rules, audit, limits.
import { convexTest } from "convex-test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MCP_POSTS_PER_HOUR_PER_KEY } from "../../convex/mcpWrite";
import { decodeBase64Image, sniffImage } from "../../lib/social/imageBytes";

const modules = import.meta.glob("../../convex/**/*.*s");
const SECRET = "s".repeat(40);

beforeAll(() => {
  process.env.MCP_SERVER_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.MCP_SERVER_SECRET;
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "u_alice", tokenIdentifier: "clerk|u_alice" });
  const bob = t.withIdentity({ subject: "u_bob", tokenIdentifier: "clerk|u_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const key = async (userId: Id<"users">, hashChar: string, scope?: "read" | "write", expiresAt?: number) => {
    await t.mutation(internal.apiKeys.insert, { userId, name: hashChar, hash: hashChar.repeat(64), prefix: `necro_sk_${hashChar.repeat(8)}`, scope, expiresAt });
    const who = await t.mutation(api.mcp.authenticate, { hash: hashChar.repeat(64), secret: SECRET });
    return who;
  };
  return { t, alice, aliceId, bobId, key };
}

describe("MCP keys: scopes", () => {
  it("old keys and new default keys are read-only; write keys say so; expired keys are refused at the door", async () => {
    const { aliceId, key } = await setup();
    expect(await key(aliceId, "a")).toMatchObject({ ok: true, scope: "read" });
    expect(await key(aliceId, "b", "write", Date.now() + 86_400_000)).toMatchObject({ ok: true, scope: "write" });
    expect(await key(aliceId, "c", "write", Date.now() - 1)).toEqual({ ok: false, status: 401 });
  });

  it("a read-only key can read connections and posts but can never post or cancel, even if a client calls the function directly", async () => {
    const { t, aliceId, key } = await setup();
    const who = await key(aliceId, "a", "read");
    if (!who.ok) throw new Error("auth");
    const k = { secret: SECRET, userId: aliceId, keyId: who.keyId };
    const conns = await t.query(api.mcpWrite.connections, k);
    expect(conns.map((c) => c.platform)).toEqual(["linkedin", "x", "instagram", "tiktok"]);
    expect(conns.every((c) => !c.connected && c.delivery === "reminder")).toBe(true);
    expect(await t.query(api.mcpWrite.posts, k)).toEqual([]);
    await expect(t.mutation(api.mcpWrite.compose, { ...k, text: "Hello", platforms: ["linkedin"] })).rejects.toThrow(/read-only/);
    await expect(t.query(api.mcpWrite.assertWriteKey, k)).rejects.toThrow(/read-only/);
  });

  it("refuses a wrong secret, another user's key, a revoked key and an expired key on the server", async () => {
    const { t, alice, aliceId, bobId, key } = await setup();
    const who = await key(aliceId, "e", "write", Date.now() + 86_400_000);
    if (!who.ok) throw new Error("auth");
    const k = { secret: SECRET, userId: aliceId, keyId: who.keyId };
    await expect(t.mutation(api.mcpWrite.compose, { ...k, secret: "x".repeat(40), text: "Hi", platforms: ["linkedin"] })).rejects.toThrow(/Forbidden/);
    await expect(t.mutation(api.mcpWrite.compose, { ...k, userId: bobId, text: "Hi", platforms: ["linkedin"] })).rejects.toThrow(/not valid/);
    await t.run((ctx) => ctx.db.patch(who.keyId, { expiresAt: Date.now() - 1 }));
    await expect(t.mutation(api.mcpWrite.compose, { ...k, text: "Hi", platforms: ["linkedin"] })).rejects.toThrow(/not valid/);
    await t.run((ctx) => ctx.db.patch(who.keyId, { expiresAt: Date.now() + 86_400_000 }));
    await alice.mutation(api.apiKeys.revoke, { keyId: who.keyId });
    await expect(t.mutation(api.mcpWrite.compose, { ...k, text: "Hi", platforms: ["linkedin"] })).rejects.toThrow(/not valid/);
  });
});

describe("MCP write tools: posting", () => {
  it("posts and schedules with the app's rules, records the key, refuses duplicates, and cancels", async () => {
    const { t, aliceId, key } = await setup();
    const who = await key(aliceId, "e", "write", Date.now() + 86_400_000);
    if (!who.ok) throw new Error("auth");
    const k = { secret: SECRET, userId: aliceId, keyId: who.keyId };

    const now = await t.mutation(api.mcpWrite.compose, { ...k, text: "Necro is live. RSS is back.", platforms: ["linkedin", "x"] });
    expect(now.perPlatform.map((r) => [r.platform, r.delivery])).toEqual([["linkedin", "reminder"], ["x", "reminder"]]); // nothing connected
    const rows = await t.run((ctx) => ctx.db.query("publishes").collect());
    expect(rows.every((r) => r.via === "mcp:necro_sk_eeeeeeee" && r.kind === "manual")).toBe(true);

    // One post, once: the same text to the same account is refused, exactly as in the app.
    await expect(t.mutation(api.mcpWrite.compose, { ...k, text: "Necro is live. RSS is back.", platforms: ["linkedin"] })).rejects.toThrow();

    // Instagram needs an image; a bad time is refused with a clear message.
    await expect(t.mutation(api.mcpWrite.compose, { ...k, text: "Photo time", platforms: ["instagram"] })).rejects.toThrow(/needs an image/);
    await expect(t.mutation(api.mcpWrite.compose, { ...k, text: "Later", platforms: ["linkedin"], atIso: "tomorrow" })).rejects.toThrow(/ISO 8601/);

    const at = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const scheduled = await t.mutation(api.mcpWrite.compose, { ...k, text: "See you at the webinar.", platforms: ["linkedin"], atIso: at });
    expect(scheduled).toMatchObject({ status: "scheduled", when: "scheduled" });
    expect(scheduled.scheduledFor.utc).toBe(at);
    const publishId = scheduled.perPlatform[0].publishId;
    const listed = await t.query(api.mcpWrite.posts, k);
    expect(listed.find((p) => p.id === publishId)).toMatchObject({ status: "scheduled", createdBy: "ai-assistant", postId: scheduled.postId });

    await t.mutation(api.mcpWrite.cancel, { ...k, postId: scheduled.postId });
    expect((await t.run((ctx) => ctx.db.get(publishId)))?.status).toBe("canceled");
  });

  it(`limits one key to ${MCP_POSTS_PER_HOUR_PER_KEY} posts an hour`, async () => {
    const { t, aliceId, key } = await setup();
    const who = await key(aliceId, "e", "write", Date.now() + 86_400_000);
    if (!who.ok) throw new Error("auth");
    const k = { secret: SECRET, userId: aliceId, keyId: who.keyId };
    const at = new Date(Date.now() + 3_600_000).toISOString();
    for (let i = 0; i < MCP_POSTS_PER_HOUR_PER_KEY; i++) {
      await t.mutation(api.mcpWrite.compose, { ...k, text: `Post number ${i}`, platforms: ["linkedin"], atIso: at });
    }
    await expect(t.mutation(api.mcpWrite.compose, { ...k, text: "One too many", platforms: ["linkedin"], atIso: at })).rejects.toThrow(/posts an hour/);
  });
});

describe("one post, once, with images", () => {
  it("the same picture uploaded twice (as an AI assistant does on every call) is still the same post", async () => {
    const { t, aliceId, key } = await setup();
    const who = await key(aliceId, "e", "write", Date.now() + 86_400_000);
    if (!who.ok) throw new Error("auth");
    const k = { secret: SECRET, userId: aliceId, keyId: who.keyId };
    const bytes = decodeBase64Image("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")!;
    const store = async () => {
      const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "image/png" })));
      await t.mutation(internal.mcpWrite.registerImage, { userId: aliceId, storageId });
      return storageId;
    };
    const first = await store();
    const second = await store();
    expect(first).not.toEqual(second);
    const at = new Date(Date.now() + 3_600_000).toISOString();
    await t.mutation(api.mcpWrite.compose, { ...k, text: "Our new poster", platforms: ["linkedin"], storageId: first, atIso: at });
    await expect(t.mutation(api.mcpWrite.compose, { ...k, text: "Our new poster", platforms: ["linkedin"], storageId: second, atIso: at })).rejects.toThrow();
    // A different caption with the same picture is a different post.
    await t.mutation(api.mcpWrite.compose, { ...k, text: "Our new poster, take two", platforms: ["linkedin"], storageId: second, atIso: at });
  });
});

describe("images from an AI assistant", () => {
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  it("decides the type from the file's own bytes", () => {
    expect(sniffImage(decodeBase64Image(PNG)!)).toBe("image/png");
    expect(sniffImage(decodeBase64Image(`data:image/png;base64,${PNG}`)!)).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
  it("refuses anything that is not clean base64", () => {
    expect(decodeBase64Image("not base64!!")).toBeNull();
    expect(decodeBase64Image("")).toBeNull();
  });
});
