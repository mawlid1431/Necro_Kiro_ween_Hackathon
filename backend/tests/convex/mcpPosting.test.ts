// MCP posting end to end on the Convex side: upload → create (scheduled) → update → cancel, create → publish now
// against a MOCK LinkedIn (global fetch is stubbed: nothing leaves the test), plus validation, idempotency, scopes,
// limits, status rules, reminders and the audit log. Nothing here can reach a real social account.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { seal } from "../../lib/social/crypto";
import { zoned } from "../../lib/social/time";

const modules = import.meta.glob("../../convex/**/*.*s");
const SECRET = "s".repeat(40);
const HOUR = 3_600_000;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** A time `ms` from now, rounded to the minute, written the way the user would: Singapore time with its offset. */
const sgt = (fromNow: number) => zoned(Math.ceil((Date.now() + fromNow) / 60_000) * 60_000).singapore;

beforeEach(() => {
  vi.useFakeTimers();
  process.env.MCP_SERVER_SECRET = SECRET;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const k of ["MCP_SERVER_SECRET", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "SOCIAL_TOKEN_KEY", "MCP_POSTS_PER_DAY", "MCP_WRITE_CALLS_PER_HOUR"]) {
    delete process.env[k];
  }
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "p_alice", tokenIdentifier: "clerk|p_alice" });
  const bob = t.withIdentity({ subject: "p_bob", tokenIdentifier: "clerk|p_bob" });
  const aliceId = await alice.mutation(api.users.store, {});
  const bobId = await bob.mutation(api.users.store, {});
  const key = async (userId: Id<"users">, ch: string, scope: "read" | "write" = "write") => {
    await t.mutation(internal.apiKeys.insert, {
      userId, name: `key ${ch}`, hash: ch.repeat(64), prefix: `necro_sk_${ch.repeat(8)}`, scope, expiresAt: scope === "write" ? Date.now() + 30 * 86_400_000 : undefined,
    });
    const who = await t.mutation(api.mcp.authenticate, { hash: ch.repeat(64), secret: SECRET });
    if (!who.ok) throw new Error("auth");
    return { secret: SECRET, userId, keyId: who.keyId };
  };
  return { t, alice, bob, aliceId, bobId, key };
}

/** A connected LinkedIn account and a mock LinkedIn API that records every request. */
function mockLinkedIn() {
  process.env.LINKEDIN_CLIENT_ID = "test-id";
  process.env.LINKEDIN_CLIENT_SECRET = "test-secret";
  process.env.SOCIAL_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64");
  const calls: { url: string; method: string; body?: string; auth?: string }[] = [];
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const headers = new Headers(init?.headers);
      calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined, auth: headers.get("authorization") ?? undefined });
      if (url.includes("/rest/images?action=initializeUpload")) {
        return Response.json({ value: { uploadUrl: "https://upload.mock-linkedin.test/img1", image: "urn:li:image:IMG1" } });
      }
      if (url.startsWith("https://upload.mock-linkedin.test/")) return new Response(null, { status: 201 });
      if (url.endsWith("/rest/posts")) {
        n += 1;
        return new Response(null, { status: 201, headers: { "x-restli-id": `urn:li:share:${1000 + n}` } });
      }
      return new Response("unexpected request in test", { status: 500 });
    }),
  );
  return {
    calls,
    connect: (t: Awaited<ReturnType<typeof setup>>["t"], userId: Id<"users">) =>
      t.run((ctx) =>
        ctx.db.insert("connections", { userId, platform: "linkedin", accountId: "person1", name: "Test Person", accessToken: seal("li-token"), status: "active", connectedAt: Date.now() }),
      ),
  };
}

describe("scopes: posts:write", () => {
  it("a read-only key can read a post but every write call is refused on the server", async () => {
    const { t, aliceId, key } = await setup();
    const w = await key(aliceId, "a", "write");
    const r = await key(aliceId, "b", "read");
    const created = await t.mutation(api.mcpWrite.compose, { ...w, text: "Hello", platforms: ["linkedin"], atIso: sgt(2 * HOUR), idempotencyKey: "k1" });
    expect((await t.query(api.mcpWrite.post, { ...r, postId: created.postId })).status).toBe("scheduled");
    await expect(t.mutation(api.mcpWrite.compose, { ...r, text: "Hi", platforms: ["linkedin"], idempotencyKey: "k2" })).rejects.toThrow(/read only/);
    await expect(t.mutation(api.mcpWrite.compose, { ...r, text: "Hello", platforms: ["linkedin"], idempotencyKey: "k1" })).rejects.toThrow(/read only/);
    await expect(t.mutation(api.mcpWrite.update, { ...r, postId: created.postId, text: "Edit" })).rejects.toThrow(/read only/);
    await expect(t.mutation(api.mcpWrite.cancel, { ...r, postId: created.postId })).rejects.toThrow(/read only/);
    await expect(t.mutation(api.mcpWrite.publishNow, { ...r, postId: created.postId })).rejects.toThrow(/read only/);
    await expect(t.action(api.mcpWriteNode.storeImage, { ...r, imageBase64: PNG, mimeType: "image/png" })).rejects.toThrow(/read only/);
  });

  it("the owner turns posting on for an existing key (with an expiry) and off again; nobody else can", async () => {
    const { t, alice, bob, aliceId, key } = await setup();
    const r = await key(aliceId, "c", "read");
    await expect(bob.mutation(api.apiKeys.setScope, { keyId: r.keyId as Id<"apiKeys">, scope: "write" })).rejects.toThrow();
    await alice.mutation(api.apiKeys.setScope, { keyId: r.keyId as Id<"apiKeys">, scope: "write" });
    const row = await t.run((ctx) => ctx.db.get(r.keyId as Id<"apiKeys">));
    expect(row?.scope).toBe("write");
    expect(row?.expiresAt).toBeGreaterThan(Date.now() + 89 * 86_400_000);
    await t.mutation(api.mcpWrite.compose, { ...r, text: "Now I can post", platforms: ["x"], atIso: sgt(HOUR), idempotencyKey: "c1" });
    await alice.mutation(api.apiKeys.setScope, { keyId: r.keyId as Id<"apiKeys">, scope: "read" });
    await expect(t.mutation(api.mcpWrite.compose, { ...r, text: "Not any more", platforms: ["x"], idempotencyKey: "c2" })).rejects.toThrow(/read only/);
  });
});

describe("validation before saving", () => {
  it("refuses empty text, over-long text (with the count), bad or past times, and images or items that are not the user's", async () => {
    const { t, aliceId, bobId, key } = await setup();
    const k = await key(aliceId, "d");
    const kb = await key(bobId, "e");
    const base = { ...k, platforms: ["linkedin" as const], idempotencyKey: "v" };
    await expect(t.mutation(api.mcpWrite.compose, { ...base, text: "   " })).rejects.toThrow(/text is empty/);
    await expect(t.mutation(api.mcpWrite.compose, { ...base, text: "x".repeat(281), platforms: ["x"] })).rejects.toThrow("Too long for X: 281 characters (limit 280).");
    await expect(t.mutation(api.mcpWrite.compose, { ...base, text: "y".repeat(3001) })).rejects.toThrow("Too long for LinkedIn: 3,001 characters (limit 3,000).");
    await expect(t.mutation(api.mcpWrite.compose, { ...base, text: "Hi", atIso: "2026-11-26T09:00:00" })).rejects.toThrow(/time zone/);
    await expect(t.mutation(api.mcpWrite.compose, { ...base, text: "Hi", atIso: zoned(Date.now() - HOUR).singapore })).rejects.toThrow(/in the past/);
    await expect(t.mutation(api.mcpWrite.compose, { ...base, text: "Hi", imageId: "nope" })).rejects.toThrow(/Unknown imageId/);
    const bobImage = await t.action(api.mcpWriteNode.storeImage, { ...kb, imageBase64: PNG, mimeType: "image/png" });
    await expect(t.mutation(api.mcpWrite.compose, { ...base, text: "Hi", imageId: bobImage.imageId })).rejects.toThrow(/Unknown imageId/);
    await expect(t.mutation(api.mcpWrite.compose, { ...base, text: "Hi", sourceItemId: "nope" })).rejects.toThrow(/Unknown sourceItemId/);
    expect(await t.run((ctx) => ctx.db.query("publishes").collect())).toHaveLength(0);
  });

  it("checks image type and size, and the declared type against the file's own bytes", async () => {
    const { t, aliceId, key } = await setup();
    const k = await key(aliceId, "f");
    await expect(t.action(api.mcpWriteNode.storeImage, { ...k, imageBase64: PNG, mimeType: "image/webp" })).rejects.toThrow(/PNG or JPEG/);
    await expect(t.action(api.mcpWriteNode.storeImage, { ...k, imageBase64: PNG, mimeType: "image/jpeg" })).rejects.toThrow(/file is image\/png/);
    await expect(t.action(api.mcpWriteNode.storeImage, { ...k, imageBase64: btoa("GIF89a....") })).rejects.toThrow(/PNG or JPEG/);
    const big = "A".repeat(Math.ceil((5 * 1024 * 1024 + 10) / 3) * 4);
    await expect(t.action(api.mcpWriteNode.storeImage, { ...k, imageBase64: big, mimeType: "image/png" })).rejects.toThrow(/over 5 MB/);
    await expect(t.action(api.mcpWriteNode.storeImage, { ...k, imageUrl: "file:///etc/passwd" })).rejects.toThrow(/http/);
    await expect(t.action(api.mcpWriteNode.storeImage, { ...k, imageUrl: "http://127.0.0.1/admin.png" })).rejects.toThrow();
    await expect(t.action(api.mcpWriteNode.storeImage, { ...k, imageUrl: "http://169.254.169.254/latest/meta-data" })).rejects.toThrow();
  });
});

describe("raw image upload (upload link → bytes → upload_post_image with storageId)", () => {
  const pngBytes = () => Uint8Array.from(atob(PNG), (ch) => ch.charCodeAt(0));

  it("gives write keys a one-time URL, checks the uploaded bytes, and registers the image once", async () => {
    const { t, aliceId, bobId, key } = await setup();
    const k = await key(aliceId, "a");
    const r = await key(aliceId, "b", "read");
    expect((await t.mutation(api.mcpWrite.uploadUrl, k)).uploadUrl).toMatch(/^https?:\/\//);
    await expect(t.mutation(api.mcpWrite.uploadUrl, r)).rejects.toThrow(/read only/);

    // What the assistant's POST to the URL does: the bytes land in storage (here with no Content-Type header).
    const sid = await t.run((ctx) => ctx.storage.store(new Blob([pngBytes()])));
    const img = await t.action(api.mcpWriteNode.storeImage, { ...k, uploadedStorageId: sid });
    expect(img).toMatchObject({ contentType: "image/png", bytes: pngBytes().length });
    expect(img.previewUrl).toMatch(/^https?:\/\//);
    // Usable straight away in a post.
    const p = await t.mutation(api.mcpWrite.compose, { ...k, text: "Poster day", platforms: ["linkedin"], imageId: img.imageId, atIso: sgt(HOUR), idempotencyKey: "up-1" });
    expect(p.image?.imageId).toBe(img.imageId);
    // Calling again with the same id is harmless; another user can never claim it.
    expect((await t.action(api.mcpWriteNode.storeImage, { ...k, uploadedStorageId: img.imageId })).imageId).toBe(img.imageId);
    const kb = await key(bobId, "c");
    await expect(t.action(api.mcpWriteNode.storeImage, { ...kb, uploadedStorageId: img.imageId })).rejects.toThrow(/No uploaded file/);
  });

  it("deletes an uploaded file that is not a PNG or JPEG", async () => {
    const { t, aliceId, key } = await setup();
    const k = await key(aliceId, "d");
    const sid = await t.run((ctx) => ctx.storage.store(new Blob([new TextEncoder().encode("<svg onload=alert(1)>")], { type: "image/png" })));
    await expect(t.action(api.mcpWriteNode.storeImage, { ...k, uploadedStorageId: sid })).rejects.toThrow(/PNG or JPEG/);
    expect(await t.run((ctx) => ctx.storage.get(sid))).toBeNull();
    await expect(t.action(api.mcpWriteNode.storeImage, { ...k, uploadedStorageId: "nope" })).rejects.toThrow(/No uploaded file/);
    await expect(t.action(api.mcpWriteNode.storeImage, { ...k, uploadedStorageId: sid, imageUrl: "https://example.com/a.png" })).rejects.toThrow(/exactly one/);
  });
});

describe("idempotency", () => {
  it("the same idempotencyKey returns the existing post and never creates a second one", async () => {
    const { t, aliceId, key } = await setup();
    const k = await key(aliceId, "1");
    const args = { ...k, text: "Necro v1 is out", platforms: ["linkedin" as const, "x" as const], atIso: sgt(3 * HOUR), idempotencyKey: "launch-1" };
    const first = await t.mutation(api.mcpWrite.compose, args);
    const again = await t.mutation(api.mcpWrite.compose, args);
    const changed = await t.mutation(api.mcpWrite.compose, { ...args, text: "Different text, same key" });
    expect(first.duplicate).toBe(false);
    expect(again).toMatchObject({ duplicate: true, postId: first.postId });
    expect(changed).toMatchObject({ duplicate: true, postId: first.postId, text: "Necro v1 is out" });
    expect(await t.run((ctx) => ctx.db.query("publishes").collect())).toHaveLength(2); // one per platform, once
    // A new key with the same text is still "one post, once" (the app's rule).
    await expect(t.mutation(api.mcpWrite.compose, { ...args, idempotencyKey: "launch-2" })).rejects.toThrow(/Already scheduled/);
  });
});

describe("rate limits (configurable)", () => {
  it("caps posts a day per key, counting one per platform", async () => {
    process.env.MCP_POSTS_PER_DAY = "3";
    const { t, aliceId, key } = await setup();
    const k = await key(aliceId, "2");
    await t.mutation(api.mcpWrite.compose, { ...k, text: "One", platforms: ["linkedin", "x"], atIso: sgt(HOUR), idempotencyKey: "1" });
    await t.mutation(api.mcpWrite.compose, { ...k, text: "Two", platforms: ["linkedin"], atIso: sgt(HOUR), idempotencyKey: "2" });
    await expect(t.mutation(api.mcpWrite.compose, { ...k, text: "Three", platforms: ["linkedin"], atIso: sgt(HOUR), idempotencyKey: "3" })).rejects.toThrow(/3 posts a day/);
  });

  it("caps write calls an hour per key", async () => {
    process.env.MCP_WRITE_CALLS_PER_HOUR = "2";
    const { t, aliceId, key } = await setup();
    const k = await key(aliceId, "3");
    const p = await t.mutation(api.mcpWrite.compose, { ...k, text: "One", platforms: ["linkedin"], atIso: sgt(HOUR), idempotencyKey: "1" });
    await t.mutation(api.mcpWrite.update, { ...k, postId: p.postId, text: "One, edited" });
    await expect(t.mutation(api.mcpWrite.cancel, { ...k, postId: p.postId })).rejects.toThrow(/2 write calls an hour/);
  });
});

describe("upload → create (scheduled) → update → cancel", () => {
  it("runs through the app's pipeline, shows up where the dashboard reads, and is audited", async () => {
    const { t, alice, aliceId, key } = await setup();
    const k = await key(aliceId, "4");
    const img = await t.action(api.mcpWriteNode.storeImage, { ...k, imageBase64: PNG, mimeType: "image/png" });
    expect(img.imageId).toBeTruthy();
    expect(img.previewUrl).toMatch(/^https?:\/\//);

    const at = sgt(5 * HOUR);
    const created = await t.mutation(api.mcpWrite.compose, {
      ...k, text: "Necro v1 is here.", platforms: ["linkedin", "tiktok"], imageId: img.imageId, atIso: at, idempotencyKey: "flow-1",
    });
    expect(created).toMatchObject({ status: "scheduled", when: "scheduled", createdBy: "ai-assistant" });
    expect(created.scheduledFor.singapore).toBe(at);
    expect(created.perPlatform.map((p) => [p.platform, p.delivery, p.status])).toEqual([
      ["linkedin", "reminder", "scheduled"], // not connected: a reminder, not an error
      ["tiktok", "reminder", "scheduled"], // TikTok is always a reminder
    ]);

    // The dashboard's live calendar query sees the same rows (Convex re-runs it on every change: no refresh).
    const tl = await alice.query(api.social.timeline, { from: Date.now(), to: Date.now() + 10 * HOUR });
    expect(tl.map((e) => e.platform).sort()).toEqual(["linkedin", "tiktok"]);
    expect(tl.every((e) => e.status === "scheduled" && e.imageUrl)).toBe(true);

    const later = sgt(7 * HOUR);
    const updated = await t.mutation(api.mcpWrite.update, { ...k, postId: created.postId, text: "Necro v1 is here!", platforms: ["linkedin"], atIso: later });
    expect(updated).toMatchObject({ postId: created.postId, text: "Necro v1 is here!", status: "scheduled" });
    expect(updated.scheduledFor.singapore).toBe(later);
    expect(updated.perPlatform.filter((p) => p.status !== "canceled").map((p) => p.platform)).toEqual(["linkedin"]);
    expect(updated.image?.imageId).toBe(img.imageId);

    const canceled = await t.mutation(api.mcpWrite.cancel, { ...k, postId: created.postId });
    expect(canceled.status).toBe("canceled");
    expect((await t.query(api.mcpWrite.post, { ...k, postId: created.postId })).status).toBe("canceled");
    await expect(t.mutation(api.mcpWrite.update, { ...k, postId: created.postId, text: "Too late" })).rejects.toThrow(/already cancelled/);

    // Nothing was ever sent: the scheduled jobs were cancelled.
    vi.advanceTimersByTime(8 * HOUR);
    await t.finishInProgressScheduledFunctions();
    expect((await t.query(api.mcpWrite.post, { ...k, postId: created.postId })).status).toBe("canceled");

    const log = await alice.query(api.mcpWrite.auditLog, {});
    expect(log.map((r) => r.tool).reverse()).toEqual(["upload_post_image", "create_post", "update_post", "cancel_post"]);
    expect(log.every((r) => r.status === "ok" && r.keyLabel === "necro_sk_44444444")).toBe(true);
    expect(log.find((r) => r.tool === "create_post")?.postId).toBe(created.postId);
  });

  it("records refused calls in the audit log too", async () => {
    const { t, alice, aliceId, key } = await setup();
    const k = await key(aliceId, "5", "read");
    await t.mutation(api.mcpWrite.auditRefusal, { ...k, tool: "create_post", message: "This key is read-only (no posts:write)." });
    const log = await alice.query(api.mcpWrite.auditLog, {});
    expect(log[0]).toMatchObject({ tool: "create_post", status: "refused", message: "This key is read-only (no posts:write)." });
  });
});

describe("publishing through the existing scheduler (mock LinkedIn)", () => {
  it("a scheduled post with an image goes out at its Singapore time; get_post then shows posted and the live link", async () => {
    const { t, aliceId, key } = await setup();
    const li = mockLinkedIn();
    await li.connect(t, aliceId);
    const k = await key(aliceId, "6");
    const img = await t.action(api.mcpWriteNode.storeImage, { ...k, imageBase64: PNG, mimeType: "image/png" });
    const at = sgt(2 * HOUR);
    const p = await t.mutation(api.mcpWrite.compose, { ...k, text: "Necro v1 #rss", platforms: ["linkedin"], imageId: img.imageId, atIso: at, idempotencyKey: "li-1" });
    expect(p.perPlatform[0]).toMatchObject({ platform: "linkedin", delivery: "auto", status: "scheduled" });

    // One minute before the time: nothing sent.
    vi.advanceTimersByTime(Date.parse(at) - Date.now() - 60_000);
    await t.finishInProgressScheduledFunctions();
    expect(li.calls).toHaveLength(0);
    expect((await t.query(api.mcpWrite.post, { ...k, postId: p.postId })).status).toBe("scheduled");

    vi.advanceTimersByTime(61_000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const done = await t.query(api.mcpWrite.post, { ...k, postId: p.postId });
    expect(done).toMatchObject({ status: "posted", liveUrl: "https://www.linkedin.com/feed/update/urn:li:share:1001/", error: null });
    expect(done.perPlatform[0].postedAt?.utc).toBeTruthy();

    // The image went with it, and the sealed token was used (never returned).
    expect(li.calls.map((c) => c.url)).toEqual([
      "https://api.linkedin.com/rest/images?action=initializeUpload",
      "https://upload.mock-linkedin.test/img1",
      "https://api.linkedin.com/rest/posts",
    ]);
    expect(JSON.parse(li.calls[2].body!).content.media.id).toBe("urn:li:image:IMG1");
    expect(li.calls[2].auth).toBe("Bearer li-token");
    expect(JSON.stringify(done)).not.toContain("li-token");
  });

  it("publish_post_now sends a scheduled post right away; posted posts cannot be edited or cancelled", async () => {
    const { t, aliceId, key } = await setup();
    const li = mockLinkedIn();
    await li.connect(t, aliceId);
    const k = await key(aliceId, "7");
    const p = await t.mutation(api.mcpWrite.compose, { ...k, text: "Shipping today", platforms: ["linkedin"], atIso: sgt(24 * HOUR), idempotencyKey: "now-1" });
    const sent = await t.mutation(api.mcpWrite.publishNow, { ...k, postId: p.postId });
    expect(sent.note).toMatch(/get_post/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const done = await t.query(api.mcpWrite.post, { ...k, postId: p.postId });
    expect(done).toMatchObject({ status: "posted", liveUrl: "https://www.linkedin.com/feed/update/urn:li:share:1001/" });
    expect(li.calls.map((c) => c.url)).toEqual(["https://api.linkedin.com/rest/posts"]);

    await expect(t.mutation(api.mcpWrite.update, { ...k, postId: p.postId, text: "Edit" })).rejects.toThrow(/already posted/);
    await expect(t.mutation(api.mcpWrite.cancel, { ...k, postId: p.postId })).rejects.toThrow(/already posted/);
    await expect(t.mutation(api.mcpWrite.publishNow, { ...k, postId: p.postId })).rejects.toThrow(/already posted/);
    // Advancing to the old time sends nothing more.
    vi.advanceTimersByTime(25 * HOUR);
    await t.finishInProgressScheduledFunctions();
    expect(li.calls).toHaveLength(1);
  });

  it("an expired LinkedIn token fails with a readable message (never a stack trace)", async () => {
    const { t, aliceId, key } = await setup();
    const li = mockLinkedIn();
    await li.connect(t, aliceId);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Invalid access token", serviceErrorCode: 65601 }, { status: 401 })));
    const k = await key(aliceId, "8");
    const p = await t.mutation(api.mcpWrite.compose, { ...k, text: "Will fail", platforms: ["linkedin"], idempotencyKey: "fail-1" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const done = await t.query(api.mcpWrite.post, { ...k, postId: p.postId });
    expect(done.status).toBe("failed");
    expect(done.error).toMatch(/^LinkedIn said: /);
    expect(done.error).not.toMatch(/at .*\.ts:\d+/);
  });
});
