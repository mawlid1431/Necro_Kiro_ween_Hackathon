// @vitest-environment node
// The MCP server itself (frontend/app/api/mcp/tools.ts), driven by a real MCP client over an in-memory transport.
// Its Convex client is a thin bridge to convex-test, so every tool call runs the real Convex functions.
// Checks: the 13 read tools are listed for every key; the 6 posting tools only with posts:write; a full
// upload → create → get → update → cancel flow and a publish-now flow (mock LinkedIn via a stubbed fetch).
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
  "get_stats", "get_briefing", "get_omens", "get_seance", "get_item", "get_grave", "list_items",
  "list_graves", "list_kindred", "list_posts", "list_connections", "search_items", "ask_crypt", "get_dashboard", "get_page_image", "screenshot_page",
];
const POSTING_TOOLS = ["upload_post_image", "create_post", "get_post", "update_post", "cancel_post", "publish_post_now"];

beforeEach(() => {
  process.env.MCP_SERVER_SECRET = SECRET;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const k of ["MCP_SERVER_SECRET", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "SOCIAL_TOKEN_KEY"]) delete process.env[k];
});

async function connect(scope: "read" | "write") {
  const { buildServer } = await import("../../../frontend/app/api/mcp/tools");
  const { Client } = await import("../../../frontend/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
  const { InMemoryTransport } = await import("../../../frontend/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js");

  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "m_alice", tokenIdentifier: "clerk|m_alice" });
  const userId = await alice.mutation(api.users.store, {});
  await t.mutation(internal.apiKeys.insert, {
    userId, name: "Claude", hash: "a".repeat(64), prefix: "necro_sk_aaaaaaaa", scope, expiresAt: scope === "write" ? Date.now() + 30 * 86_400_000 : undefined,
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
  const server = buildServer({ convex: bridge as never, secret: SECRET, userId, keyPrefix: who.prefix, keyId: who.keyId, scope: who.scope });
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
  return { t, alice, userId, client, call };
}

const sgt = (fromNow: number) => zoned(Math.ceil((Date.now() + fromNow) / 60_000) * 60_000).singapore;

describe("MCP server: tool list", () => {
  it("a read-only key sees exactly the 13 original read tools plus get_dashboard, get_page_image and screenshot_page; a posts:write key also sees the posting tools", async () => {
    const read = await connect("read");
    expect((await read.client.listTools()).tools.map((x) => x.name).sort()).toEqual([...READ_TOOLS].sort());

    const write = await connect("write");
    const names = (await write.client.listTools()).tools.map((x) => x.name);
    for (const n of [...READ_TOOLS, ...POSTING_TOOLS]) expect(names).toContain(n);
    const tools = (await write.client.listTools()).tools;
    for (const n of ["upload_post_image", "create_post", "update_post", "cancel_post", "publish_post_now"]) {
      const d = tools.find((x) => x.name === n)!.description ?? "";
      if (n !== "upload_post_image") expect(d).toMatch(/REAL social accounts/);
    }
  });

  it("read tools still work unchanged for a read-only key, and a posting tool cannot be called", async () => {
    const { call } = await connect("read");
    expect((await call("get_stats")).data).toMatchObject({ feeds: 0, unread: 0 });
    expect((await call("list_posts")).data).toEqual([]);
    const home = (await call("get_dashboard")).data;
    expect(home).toMatchObject({ feeds: { total: 0 }, posts: { scheduled: 0 }, upNext: [] });
    expect(home.asOf.singapore).toMatch(/[+]08:00$/);
    expect(home.connections).toHaveLength(4);
    expect((await call("list_connections")).data.map((c: { platform: string }) => c.platform)).toEqual(["linkedin", "x", "instagram", "tiktok"]);
    const refused = await call("create_post", { text: "Hi", platforms: ["linkedin"], idempotencyKey: "x" });
    expect(refused.isError).toBe(true);
    expect(String(refused.data)).toMatch(/not found/i); // not even listed for a read-only key
  });
});

describe("MCP server: pictures of Necro sections", () => {
  it("returns a live PNG of the dashboard, posts and feeds as an MCP image block, for a read-only key too", async () => {
    const { client } = await connect("read");
    for (const page of ["dashboard", "posts", "feeds"]) {
      const r = (await client.callTool({ name: "get_page_image", arguments: { page } })) as {
        isError?: boolean;
        content: ({ type: "image"; data: string; mimeType: string } | { type: "text"; text: string })[];
      };
      expect(r.isError).toBeFalsy();
      const img = r.content.find((x) => x.type === "image") as { data: string; mimeType: string };
      expect(img.mimeType).toBe("image/png");
      const bytes = Uint8Array.from(atob(img.data), (ch) => ch.charCodeAt(0));
      expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // a real PNG
      expect(bytes.length).toBeGreaterThan(5_000);
      const meta = JSON.parse((r.content.find((x) => x.type === "text") as { text: string }).text);
      expect(meta).toMatchObject({ page, size: expect.stringMatching(/^1200x/) });
    }
  });
});

describe("MCP server: real screenshots", () => {
  it("screenshot_page is listed for every key, checks the key first, and refuses accounts that cannot sign in", async () => {
    const { client, alice } = await connect("read");
    const tool = (await client.listTools()).tools.find((x) => x.name === "screenshot_page")!;
    expect(tool.description).toMatch(/REAL screenshot/);
    expect(JSON.stringify(tool.inputSchema)).toContain("public_profile");
    // The test user has no real Clerk account, so the server refuses before any browser opens.
    const r = (await client.callTool({ name: "screenshot_page", arguments: { page: "settings", section: "connections" } })) as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    const err = JSON.parse(r.content[0].text);
    expect(err.error).toMatch(/FORBIDDEN|INVALID_INPUT/);
    // A bad section never reaches the browser.
    const bad = (await client.callTool({ name: "screenshot_page", arguments: { page: "settings", section: "../keys" } })) as { isError?: boolean };
    expect(bad.isError).toBe(true);
    void alice;
  });
});

describe("MCP server: posting end to end", () => {
  it("upload → create (scheduled) → get → update → cancel, with readable errors and an audit trail", async () => {
    const { alice, call } = await connect("write");
    // Route 1 (a file): no arguments → a one-time link to send raw bytes to.
    const link = await call("upload_post_image");
    expect(link.isError).toBe(false);
    expect(link.data.uploadUrl).toMatch(/^https?:\/\//);
    const img = await call("upload_post_image", { imageBase64: PNG, mimeType: "image/png" });
    expect(img.isError).toBe(false);
    expect(img.data.imageId).toBeTruthy();

    const at = sgt(26 * 3_600_000);
    const created = await call("create_post", { text: "Necro v1 is here.", platforms: ["linkedin", "x"], imageId: img.data.imageId, scheduleAt: at, idempotencyKey: "e2e-1" });
    expect(created.isError).toBe(false);
    expect(created.data).toMatchObject({ status: "scheduled", scheduledFor: { singapore: at } });
    expect(created.data.perPlatform.map((p: { delivery: string }) => p.delivery)).toEqual(["reminder", "reminder"]);
    // get_dashboard reads Home's own overview: the new post is there straight away.
    const home = (await call("get_dashboard")).data;
    expect(home.posts.scheduled).toBe(2);
    expect(home.upNext[0]).toMatchObject({ status: "scheduled", title: "Necro v1 is here." });

    const again = await call("create_post", { text: "Necro v1 is here.", platforms: ["linkedin", "x"], imageId: img.data.imageId, scheduleAt: at, idempotencyKey: "e2e-1" });
    expect(again.data).toMatchObject({ duplicate: true, postId: created.data.postId });

    const tooLong = await call("update_post", { postId: created.data.postId, text: "z".repeat(300) });
    expect(tooLong).toEqual({ isError: true, data: { error: "INVALID_INPUT", message: "Too long for X: 300 characters (limit 280)." } });

    const updated = await call("update_post", { postId: created.data.postId, text: "Necro v1 is here!" });
    expect(updated.data.text).toBe("Necro v1 is here!");

    const got = await call("get_post", { postId: created.data.postId });
    expect(got.data).toMatchObject({ postId: created.data.postId, status: "scheduled", liveUrl: null });

    const listed = await call("list_posts");
    expect(listed.data.every((p: { postId: string }) => p.postId === created.data.postId)).toBe(true);

    expect((await call("cancel_post", { postId: created.data.postId })).data.status).toBe("canceled");
    const late = await call("cancel_post", { postId: created.data.postId });
    expect(late).toEqual({ isError: true, data: { error: "INVALID_INPUT", message: "This post was already cancelled." } });

    const log = await alice.query(api.mcpWrite.auditLog, {});
    expect(log.map((r) => `${r.tool}:${r.status}`).reverse()).toEqual([
      "upload_post_image:ok", "upload_post_image:ok", "create_post:ok", "update_post:refused", "update_post:ok", "cancel_post:ok", "cancel_post:refused",
    ]);
  });

  it("create → publish_post_now against a mock LinkedIn; get_post returns posted and the live link", async () => {
    vi.useFakeTimers();
    const { t, userId, call } = await connect("write");
    process.env.LINKEDIN_CLIENT_ID = "test-id";
    process.env.LINKEDIN_CLIENT_SECRET = "test-secret";
    process.env.SOCIAL_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");
    await t.run((ctx) =>
      ctx.db.insert("connections", { userId: userId as Id<"users">, platform: "linkedin", accountId: "p9", accessToken: seal("tok"), status: "active", connectedAt: Date.now() }),
    );
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      urls.push(String(u));
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:77" } });
    }));

    const created = await call("create_post", { text: "Live from Claude", platforms: ["linkedin"], scheduleAt: sgt(48 * 3_600_000), idempotencyKey: "now-1" });
    expect(created.data.perPlatform[0]).toMatchObject({ delivery: "auto", status: "scheduled" });
    expect((await call("publish_post_now", { postId: created.data.postId })).isError).toBe(false);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const got = await call("get_post", { postId: created.data.postId });
    expect(got.data).toMatchObject({ status: "posted", liveUrl: "https://www.linkedin.com/feed/update/urn:li:share:77/" });
    expect(urls).toEqual(["https://api.linkedin.com/rest/posts"]);
  });
});
