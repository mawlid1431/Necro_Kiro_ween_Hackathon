// @vitest-environment node
// The MCP server itself (frontend/app/api/mcp/tools.ts), driven by a real MCP client over an in-memory transport.
// Its Convex client is a thin bridge to convex-test, so every tool call runs the real Convex functions.
// Checks: which tools a read-only and a read-and-write key see; annotations on every tool; scope enforced on the
// server too; confirm: true on risky tools; the draft → schedule (2 minutes ahead) → published flow against a mock
// LinkedIn (never a real account); profile, settings, analytics, pages; the screenshot fallback with charts.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { seal } from "../../lib/social/crypto";
import { zoned } from "../../lib/social/time";

const modules = import.meta.glob("../../convex/**/*.*s");
const SECRET = "s".repeat(40);
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const READ_TOOLS = [
  "list_graves", "get_grave", "list_folders", "list_items", "get_item", "search_items", "get_seance", "hold_seance", "get_stats",
  "get_briefing", "ask_crypt", "list_kindred", "get_omens", "get_dashboard", "get_analytics", "get_profile", "get_settings",
  "get_voice", "get_interests", "list_mcp_access", "list_connections", "list_posts", "get_post", "list_pages", "get_page_image",
  "screenshot_page", "get_all_page_images",
];

beforeEach(() => {
  process.env.MCP_SERVER_SECRET = SECRET;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const k of ["MCP_SERVER_SECRET", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "SOCIAL_TOKEN_KEY"]) delete process.env[k];
});

type Content = ({ type: "image"; data: string; mimeType: string } | { type: "text"; text: string })[];

async function connect(scope: "read" | "write", origin?: string) {
  const { buildServer } = await import("../../../frontend/app/api/mcp/tools");
  const { Client } = await import("../../../frontend/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
  const { InMemoryTransport } = await import("../../../frontend/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js");

  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "m_alice", tokenIdentifier: "clerk|m_alice", email: "alice@example.com", name: "Alice" });
  const userId = await alice.mutation(api.users.store, {});
  await t.mutation(internal.apiKeys.insert, {
    userId, name: "Claude", hash: "a".repeat(64), prefix: "aaaaaaaa", scope, expiresAt: scope === "write" ? Date.now() + 30 * 86_400_000 : undefined,
  });
  const who = await t.mutation(api.mcp.authenticate, { hash: "a".repeat(64), secret: SECRET });
  if (!who.ok) throw new Error("auth");

  // The route's ConvexHttpClient, bridged to convex-test.
  type Run = (ref: unknown, args: unknown) => Promise<unknown>;
  const loose = t as unknown as { query: Run; mutation: Run; action: Run };
  const bridge = {
    query: (ref: unknown, args: unknown) => loose.query(ref, args),
    mutation: (ref: unknown, args: unknown) => loose.mutation(ref, args),
    action: (ref: unknown, args: unknown) => loose.action(ref, args),
  };
  const server = buildServer({ convex: bridge as never, secret: SECRET, userId, keyPrefix: who.prefix, keyId: who.keyId, scope: who.scope, origin });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
    let data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      data = JSON.parse(r.content[0].text);
    } catch {
      data = r.content[0].text; // protocol errors (e.g. an unknown tool) are plain text
    }
    return { isError: !!r.isError, data };
  };
  return { t, alice, userId, keyId: who.keyId, client, call };
}

const sgt = (fromNow: number) => zoned(Math.ceil((Date.now() + fromNow) / 60_000) * 60_000).singapore;

async function addFeedWithItems(t: Awaited<ReturnType<typeof connect>>["t"], userId: Id<"users">, n = 3) {
  return await t.run(async (ctx) => {
    const graveId = await ctx.db.insert("graves", { userId, feedUrl: "https://example.com/feed", title: "Example", status: "alive", nextFetchAt: Date.now() + 3_600_000, failureCount: 0, unreadCount: n });
    const items: Id<"items">[] = [];
    for (let i = 0; i < n; i++) {
      const itemId = await ctx.db.insert("items", { userId, graveId, guid: `g${i}`, title: `Story ${i}`, publishedAt: Date.now() - i * 60_000, contentHtml: "<p>x</p>", excerpt: "x", isRead: false, isStarred: false, risenAt: Date.now(), score: 50 + i * 20 });
      await ctx.db.insert("kindredIndex", { userId, itemId, graveId, title: `Story ${i}`, publishedAt: Date.now() - i * 60_000 });
      items.push(itemId);
    }
    return { graveId, items };
  });
}

describe("MCP server: which tools each key gets", async () => {
  const { WRITE_TOOLS, readOnlyCall } = await import("../../../frontend/app/api/mcp/tools");

  it("a read-only key sees exactly the read tools; a read-and-write key also sees every write tool", async () => {
    const read = await connect("read");
    expect((await read.client.listTools()).tools.map((x) => x.name).sort()).toEqual([...READ_TOOLS].sort());

    const write = await connect("write");
    const names = (await write.client.listTools()).tools.map((x) => x.name).sort();
    expect(names).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
  });

  it("every tool carries MCP annotations; risky ones are marked destructive and need confirm", async () => {
    const { client } = await connect("write");
    const tools = (await client.listTools()).tools;
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toBeDefined();
      expect(typeof tool.annotations!.readOnlyHint, tool.name).toBe("boolean");
      expect(typeof tool.annotations!.destructiveHint, tool.name).toBe("boolean");
      expect(typeof tool.annotations!.idempotentHint, tool.name).toBe("boolean");
      expect(tool.annotations!.readOnlyHint, tool.name).toBe(!WRITE_TOOLS.has(tool.name) && !["get_seance", "hold_seance"].includes(tool.name));
    }
    for (const n of ["publish_post", "remove_grave", "cancel_post", "mark_all_read"]) {
      const tool = tools.find((x) => x.name === n)!;
      expect(tool.annotations!.destructiveHint, n).toBe(true);
      expect(JSON.stringify(tool.inputSchema), n).toContain("confirm");
    }
  });

  it("the route answers a write call from a read-only key with 'This key is read only' (single and batch)", async () => {
    const req = (body: unknown) => new Request("http://x/api/mcp", { method: "POST", body: JSON.stringify(body) });
    expect(await readOnlyCall(req({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "draft_post", arguments: {} } }))).toMatchObject({ name: "draft_post", batch: false });
    expect(await readOnlyCall(req([{ id: 1, method: "tools/list" }, { id: 2, method: "tools/call", params: { name: "publish_post" } }]))).toMatchObject({ batch: true, messages: [{ id: 1 }, { id: 2 }] });
    expect(await readOnlyCall(req({ id: 1, method: "tools/call", params: { name: "get_dashboard" } }))).toBeNull();
    expect(await readOnlyCall(req({ id: 1, method: "tools/list" }))).toBeNull();
  });

  it("the server refuses writes from a read-only key even when called directly", async () => {
    const { t, userId, keyId } = await connect("read");
    await expect(t.mutation(api.mcpAgent.setInterests, { secret: SECRET, userId, keyId, interests: ["ai"] })).rejects.toThrow(/read only/);
    await expect(t.mutation(api.mcpAgent.draftPost, { secret: SECRET, userId, keyId, text: "Hi", platforms: ["linkedin"] })).rejects.toThrow(/read only/);
    await expect(t.mutation(api.mcpAgent.setInterests, { secret: "wrong".repeat(10), userId, keyId, interests: ["ai"] })).rejects.toThrow();
  });
});

describe("MCP server: see everything", () => {
  it("get_dashboard has the Home chart series", async () => {
    const { t, userId, call } = await connect("read");
    await addFeedWithItems(t, userId);
    const home = (await call("get_dashboard")).data;
    expect(home.series.days).toHaveLength(14);
    expect(home.series.newArticles.at(-1)).toBe(3);
    expect(Object.keys(home.series).sort()).toEqual(["aiToolUses", "days", "mcpCalls", "newArticles", "postsPosted"]);
  });

  it("get_analytics: per-day arrays in the user's zone, totals per feed and platform", async () => {
    const { t, userId, call } = await connect("write");
    const { items } = await addFeedWithItems(t, userId);
    expect((await call("mark_read", { itemId: items[0] })).isError).toBe(false);
    const a = (await call("get_analytics", { range: "7d" })).data;
    expect(a).toMatchObject({ range: "7d", timeZone: "Asia/Singapore" });
    expect(a.days).toHaveLength(7);
    for (const s of Object.values(a.series) as unknown[][]) expect(s).toHaveLength(7);
    expect(a.totals).toMatchObject({ newArticles: 3, articlesRead: 1 });
    expect(a.perFeed).toEqual([{ graveId: expect.any(String), feed: "Example", newArticles: 3 }]);
    expect(Object.keys(a.perPlatform).sort()).toEqual(["instagram", "linkedin", "tiktok", "x"]);
    expect((await call("get_analytics", { range: "1y" })).isError).toBe(true); // zod: only 7d, 30d, 90d
  });

  it("get_profile, get_settings, list_mcp_access, list_pages: no secrets", async () => {
    const { call } = await connect("read");
    const p = (await call("get_profile")).data;
    expect(p).toMatchObject({ email: "alice@example.com", plan: "free", timezone: "Asia/Singapore", avatarUrl: null, thisConnection: { scope: "read only", canPost: false } });
    expect(p.clerkId).toBeUndefined();
    expect(p.limitsToday.seances).toMatchObject({ used: 0, limit: 100 });
    expect(p.setupNext.join(" ")).toMatch(/set_interests/);

    const s = (await call("get_settings")).data;
    expect(s.reading).toMatchObject({ summaryLanguage: "English", morningSeanceHour: 7 });
    expect(s.notStoredOnServer.theme).toMatch(/browser/);

    const access = JSON.stringify((await call("list_mcp_access")).data);
    expect(access).toContain("necro_sk_aaaaaaaa…");
    expect(access).not.toContain("a".repeat(64)); // never the hash

    const pages = (await call("list_pages")).data as { id: string; inputs: string[] }[];
    expect(pages.length).toBeGreaterThanOrEqual(28);
    expect(pages.find((x) => x.id === "article")?.inputs).toEqual(["itemId"]);
    expect(pages.find((x) => x.id === "post-preview")?.inputs).toEqual(["postId"]);
  });

  it("list_items filters by minimum score, folder and date range", async () => {
    const { t, userId, call } = await connect("read");
    const { graveId } = await addFeedWithItems(t, userId);
    await t.run((ctx) => ctx.db.patch(graveId, { folder: "Tech" }));
    const best = (await call("list_items", { minScore: 70 })).data.items;
    expect(best.map((i: { title: string }) => i.title)).toEqual(["Story 2", "Story 1"]);
    expect((await call("list_items", { folder: "Tech" })).data.items).toHaveLength(3);
    expect((await call("list_items", { folder: "Nope" })).data.items).toHaveLength(0);
    expect((await call("list_items", { since: new Date(Date.now() + 86_400_000).toISOString() })).data.items).toHaveLength(0);
  });
});

describe("MCP server: do everything (write key)", () => {
  it("setup steps can be completed by tool; settings and feeds change through the app's own rules", async () => {
    const { t, userId, call } = await connect("write");
    const { graveId, items } = await addFeedWithItems(t, userId);
    expect((await call("set_interests", { interests: ["AI", "security"] })).data.interests).toEqual(["AI", "security"]);
    expect((await call("set_voice", { tone: "Plain", samplePosts: ["Short and clear."] })).data).toMatchObject({ tone: "Plain", samplePosts: ["Short and clear."] });
    const setup = (await call("get_dashboard")).data.setup;
    expect(setup).toMatchObject({ interests: true, voice: true });

    expect((await call("update_settings", { timezone: "Not/AZone" }))).toEqual({ isError: true, data: { error: "INVALID_INPUT", message: "That timezone is not recognised." } });
    expect((await call("set_briefing_time", { hour: 6 })).data.morningSeanceHour).toBe(6);
    expect((await call("update_grave", { graveId, title: "Renamed" })).data.title).toBe("Renamed");
    expect((await call("create_folder", { name: "News", graveIds: [graveId] })).data).toEqual({ folder: "News", moved: 1 });
    expect((await call("list_folders")).data.folders[0]).toMatchObject({ name: "News", count: 1 });
    expect((await call("star", { itemId: items[1] })).data.isStarred).toBe(true);
    expect((await call("set_omens", { add: ["quantum computing"] })).data.watching).toEqual(["quantum computing"]);
    expect((await call("set_omens", { remove: ["quantum computing"] })).data.watching).toEqual([]);
  });

  it("risky tools need confirm: true", async () => {
    const { t, userId, call } = await connect("write");
    const { graveId } = await addFeedWithItems(t, userId);
    for (const [tool, args] of [["remove_grave", { graveId }], ["mark_all_read", {}]] as const) {
      const r = await call(tool, args);
      expect(r.isError, tool).toBe(true);
      expect(r.data.error).toBe("CONFIRM_REQUIRED");
    }
    expect((await call("mark_all_read", { confirm: true })).data.markedNow).toBe(3);
    expect((await call("remove_grave", { graveId, confirm: true })).data.removed).toBe("Example");
  });

  it("draft_post publishes nothing; X says plainly it is a reminder while coming soon", async () => {
    const { call } = await connect("write");
    const d = await call("draft_post", { text: "Hello from Claude", platforms: ["linkedin", "x"] });
    expect(d.data).toMatchObject({ status: "draft", text: "Hello from Claude" });
    const x = d.data.perPlatform.find((p: { platform: string }) => p.platform === "x");
    expect(x).toMatchObject({ delivery: "reminder", characters: 17, limit: 280 });
    expect(x.deliveryNote).toMatch(/coming soon.*NOT be posted automatically/);
    expect((await call("list_posts", { status: "draft" })).data).toHaveLength(1);
    expect((await call("list_posts")).data).toEqual([]); // nothing queued
    expect((await call("get_dashboard")).data.posts.scheduled).toBe(0);

    const ig = await call("draft_post", { text: "Pic", platforms: ["instagram"] });
    expect(ig.data).toMatchObject({ error: "INVALID_INPUT", message: "Instagram needs an image. Upload one with upload_post_image." });

    const noConfirm = await call("publish_post", { postId: d.data.postId });
    expect(noConfirm.data.error).toBe("CONFIRM_REQUIRED");
    expect((await call("cancel_post", { postId: d.data.postId, confirm: true })).data.status).toBe("canceled");
  });

  it("draft → schedule 2 minutes ahead → it publishes on time (mock LinkedIn), with an audit trail", async () => {
    vi.useFakeTimers();
    const { t, alice, userId, call } = await connect("write");
    process.env.LINKEDIN_CLIENT_ID = "test-id";
    process.env.LINKEDIN_CLIENT_SECRET = "test-secret";
    process.env.SOCIAL_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");
    await t.run((ctx) => ctx.db.insert("connections", { userId, platform: "linkedin", accountId: "p9", accessToken: seal("tok"), status: "active", connectedAt: Date.now() }));
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      urls.push(String(u));
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:77" } });
    }));

    const img = await call("upload_post_image", { imageBase64: PNG, mimeType: "image/png" });
    expect(img.data.imageId).toBeTruthy(); // (LinkedIn's image upload API is not mocked here, so the post itself is text only)
    const draft = await call("draft_post", { text: "Scheduled by Claude", platforms: ["linkedin"] });
    expect(draft.data.perPlatform[0]).toMatchObject({ delivery: "auto" });

    const at = sgt(2 * 60_000 + 30_000);
    const scheduled = await call("schedule_post", { postId: draft.data.postId, scheduleAt: at });
    expect(scheduled.data).toMatchObject({ status: "scheduled", scheduledFor: { singapore: at }, scheduledFrom: draft.data.postId });
    // Scheduling the same draft again returns the same post: it is queued once.
    expect((await call("schedule_post", { postId: draft.data.postId, scheduleAt: at })).data.postId).toBe(scheduled.data.postId);
    expect(urls).toEqual([]); // nothing sent before the time

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const got = await call("get_post", { postId: scheduled.data.postId });
    expect(got.data).toMatchObject({ status: "posted", liveUrl: "https://www.linkedin.com/feed/update/urn:li:share:77/" });
    expect((await call("get_post", { postId: draft.data.postId })).data.status).toBe("posted"); // the draft id follows the post
    expect(urls.filter((u) => u.endsWith("/rest/posts"))).toHaveLength(1);

    const log = (await alice.query(api.mcpWrite.auditLog, {})).map((r) => `${r.tool}:${r.status}`).reverse();
    expect(log).toEqual(["upload_post_image:ok", "draft_post:ok", "schedule_post:ok", "schedule_post:ok"]);
  });

  it("publish_post with confirm sends a draft now; reschedule and retry work on queued posts", async () => {
    vi.useFakeTimers();
    const { t, userId, call } = await connect("write");
    process.env.LINKEDIN_CLIENT_ID = "test-id";
    process.env.LINKEDIN_CLIENT_SECRET = "test-secret";
    process.env.SOCIAL_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");
    await t.run((ctx) => ctx.db.insert("connections", { userId, platform: "linkedin", accountId: "p9", accessToken: seal("tok"), status: "active", connectedAt: Date.now() }));
    let fail = true;
    vi.stubGlobal("fetch", vi.fn(async () => (fail ? new Response("nope", { status: 500 }) : new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:9" } }))));

    const a = await call("draft_post", { text: "Later", platforms: ["linkedin"] });
    const s = await call("schedule_post", { postId: a.data.postId, scheduleAt: sgt(3 * 3_600_000) });
    const moved = await call("reschedule_post", { postId: s.data.postId, scheduleAt: sgt(5 * 3_600_000) });
    expect(moved.data.scheduledFor.singapore).toBe(sgt(5 * 3_600_000));

    const d = await call("draft_post", { text: "Now please", platforms: ["linkedin"] });
    expect((await call("publish_post", { postId: d.data.postId, confirm: true })).isError).toBe(false);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const failed = await call("get_post", { postId: d.data.postId });
    expect(failed.data.status).toBe("failed");

    fail = false;
    const retried = await call("retry_post", { postId: failed.data.postId });
    expect(retried.data.retriedFrom).toBe(failed.data.postId);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await call("get_post", { postId: retried.data.postId })).data).toMatchObject({ status: "posted" });
  });
});

describe("MCP server: pictures", () => {
  it("get_page_image falls back to Necro's own drawing WITH charts when the browser cannot run, and says so", async () => {
    // No CLERK_SECRET_KEY in tests, so the headless browser cannot sign in: the fallback must say renderer "fallback".
    const { t, userId, client } = await connect("read", "http://localhost:3999");
    await addFeedWithItems(t, userId);
    for (const page of ["dashboard", "analytics"]) {
      const r = (await client.callTool({ name: "get_page_image", arguments: { page } })) as { isError?: boolean; content: Content };
      expect(r.isError, `${page}: ${JSON.stringify(r.content.filter((x) => x.type === "text"))}`).toBeFalsy();
      const img = r.content.find((x) => x.type === "image") as { data: string; mimeType: string };
      const bytes = Uint8Array.from(atob(img.data), (ch) => ch.charCodeAt(0));
      expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // a real PNG
      expect(bytes.length).toBeGreaterThan(20_000);
      const meta = JSON.parse((r.content.find((x) => x.type === "text") as { text: string }).text);
      expect(meta.pages[0]).toMatchObject({ page, renderer: "fallback" });
    }
    // A page with no server drawing reports the failure instead of an empty picture.
    const r = (await client.callTool({ name: "get_page_image", arguments: { page: "omens" } })) as { isError?: boolean; content: Content };
    expect(r.isError).toBe(true);
    expect(JSON.parse((r.content.at(-1) as { text: string }).text).pages[0]).toMatchObject({ page: "omens", renderer: "browser", error: expect.any(String) });
  });

  it("inputs are checked before any browser opens", async () => {
    const { client } = await connect("read", "http://localhost:3999");
    const bad = (await client.callTool({ name: "get_page_image", arguments: { page: "settings", section: "../keys" } })) as { isError?: boolean };
    expect(bad.isError).toBe(true);
    const wide = (await client.callTool({ name: "get_page_image", arguments: { page: "dashboard", width: 99_999 } })) as { isError?: boolean };
    expect(wide.isError).toBe(true);
    const batch = (await client.callTool({ name: "get_all_page_images", arguments: { offset: 40 } })) as { isError?: boolean };
    expect(batch.isError).toBe(true);
  });
});

describe("MCP server: isolation between users", () => {
  it("another user's key can never read or change this user's feeds, articles, drafts, posts or previews", async () => {
    const { t, userId: alice, call } = await connect("write");
    const { graveId, items } = await addFeedWithItems(t, alice);
    const draft = (await call("draft_post", { text: "Alice's draft", platforms: ["linkedin"] })).data;
    const queued = (await call("schedule_post", { postId: (await call("draft_post", { text: "Alice queued", platforms: ["linkedin"] })).data.postId, scheduleAt: sgt(5 * 3_600_000) })).data;

    // Bob: his own account and his own read-and-write key.
    const bobUser = t.withIdentity({ subject: "m_bob", tokenIdentifier: "clerk|m_bob" });
    const bob = await bobUser.mutation(api.users.store, {});
    await t.mutation(internal.apiKeys.insert, { userId: bob, name: "Bob", hash: "b".repeat(64), prefix: "bbbbbbbb", scope: "write", expiresAt: Date.now() + 86_400_000 });
    const who = await t.mutation(api.mcp.authenticate, { hash: "b".repeat(64), secret: SECRET });
    if (!who.ok) throw new Error("auth");
    const b = { secret: SECRET, userId: bob, keyId: who.keyId };

    // Bob's key with Alice's userId: refused (the key must belong to the user it acts for).
    await expect(t.query(api.mcpAgent.profile, { ...b, userId: alice })).rejects.toThrow(/not valid/);
    await expect(t.mutation(api.mcpAgent.setInterests, { ...b, userId: alice, interests: ["x"] })).rejects.toThrow(/not valid/);

    // Bob's key with Alice's ids: never found, never changed.
    const notFound = /NOT_FOUND|No (post|feed|article)|not found/i;
    await expect(t.query(api.mcpAgent.getPost, { ...b, postId: draft.postId })).rejects.toThrow(notFound);
    await expect(t.query(api.mcpAgent.getPost, { ...b, postId: queued.postId })).rejects.toThrow(notFound);
    await expect(t.mutation(api.mcpAgent.publishPost, { ...b, postId: draft.postId, confirm: true })).rejects.toThrow(notFound);
    await expect(t.mutation(api.mcpAgent.cancelPost, { ...b, postId: queued.postId, confirm: true })).rejects.toThrow(notFound);
    await expect(t.mutation(api.mcpAgent.updatePost, { ...b, postId: queued.postId, text: "hijack" })).rejects.toThrow(notFound);
    await expect(t.mutation(api.mcpAgent.setRead, { ...b, itemId: items[0], read: true })).rejects.toThrow(notFound);
    await expect(t.mutation(api.mcpAgent.removeGrave, { ...b, graveId, confirm: true })).rejects.toThrow(notFound);
    await expect(t.mutation(api.mcpAgent.updateGrave, { ...b, graveId, title: "x" })).rejects.toThrow(notFound);
    await expect(t.query(api.mcpAgent.itemsFiltered, { ...b, filter: "all", graveId, limit: 10 })).rejects.toThrow(notFound);
    await expect(t.mutation(api.mcpAgent.draftPost, { ...b, text: "x", platforms: ["linkedin"], sourceItemId: items[0] })).rejects.toThrow(notFound);
    await expect(t.mutation(api.mcpAgent.saveGenerated, { ...b, itemId: items[0], platform: "linkedin", text: "x", keyLabel: "b" })).rejects.toThrow(notFound);

    // Bob's own views show none of Alice's data.
    expect((await t.query(api.mcpAgent.listPosts, { ...b, limit: 50 }))).toEqual([]);
    expect((await t.query(api.mcpAgent.listPosts, { ...b, status: "draft", limit: 50 }))).toEqual([]);
    expect((await t.query(api.mcpAgent.analytics, { ...b, days: 7 })).totals.newArticles).toBe(0);
    expect((await t.query(api.mcpAgent.folders, b)).folders).toEqual([]);
    expect(JSON.stringify(await t.query(api.mcpAgent.access, b))).not.toContain("Claude"); // Alice's key name
    // The preview page, signed in as Bob, cannot open Alice's post.
    expect(await bobUser.query(api.mcpAgent.previewForPage, { postId: draft.postId })).toBeNull();
    expect(await bobUser.query(api.mcpAgent.previewForPage, { postId: queued.postId })).toBeNull();

    // And Alice's data is untouched.
    expect((await call("get_post", { postId: queued.postId })).data).toMatchObject({ status: "scheduled", text: "Alice queued" });
    expect((await call("get_grave", { graveId })).data.title).toBe("Example");
  });
});
