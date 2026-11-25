import "server-only";
import { createElement as h, type ReactNode } from "react";
import { ImageResponse } from "next/og";

// get_page_image: a live picture of one Necro section, drawn on Necro's server from the user's current data
// (the same numbers the app shows) and returned to the assistant as an MCP image block. Nothing is a stored
// screenshot: every call reads the database again, so the picture is always "now". Same renderer as
// /api/post-image (next/og), no browser and no login cookies involved.

export const PAGES = ["dashboard", "posts", "feeds"] as const;
export type Page = (typeof PAGES)[number];

const W = 1200;
const C = { bg: "#14161c", panel: "#1d2028", line: "#2c303b", ink: "#f4f5f7", dim: "#a3a8b5", ecto: "#9be8a8", candle: "#f2c66d", danger: "#ff8a80" };

type Dashboard = {
  asOf: { label: string };
  feeds: { total: number; alive: number; sleeping: number; broken: number; unread: number };
  newArticlesToday: number;
  posts: { posted30d: number; scheduled: number; due: number; failed7d: number };
  upNext: { platform: string; status: string; title: string; at: { label: string } }[];
  recentlyPosted: { platform: string; title: string; at: { label: string } }[];
  readNext: { title: string; feed: string; score: number }[];
  connections: { platform: string; connected: boolean }[];
};
type PostRow = { platform: string; status: string; atSingapore: string; text: string; createdBy: string };
type FeedRow = { title: string; status: string; unreadCount: number; folder: string | null };

const NAMES: Record<string, string> = { linkedin: "LinkedIn", x: "X", instagram: "Instagram", tiktok: "TikTok" };
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const row = (style: Record<string, unknown>, ...children: ReactNode[]) => h("div", { style: { display: "flex", ...style } }, ...children);
const col = (style: Record<string, unknown>, ...children: ReactNode[]) => h("div", { style: { display: "flex", flexDirection: "column", ...style } }, ...children);
const text = (t: string, style: Record<string, unknown> = {}) => h("div", { style: { display: "flex", color: C.ink, fontSize: 22, ...style } }, t);

function frame(title: string, asOf: string, body: ReactNode) {
  return col(
    { width: "100%", height: "100%", background: C.bg, padding: 48, fontFamily: "sans-serif" },
    row(
      { justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
      row({ alignItems: "center", gap: 14 }, text("NECRO", { color: C.ecto, fontSize: 26, fontWeight: 700, letterSpacing: 6 }), text(title, { fontSize: 34, fontWeight: 700 })),
      text(`Live · ${asOf}`, { color: C.dim, fontSize: 20 }),
    ),
    body,
  );
}

function stat(label: string, value: string | number, tone: string = C.ink) {
  return col({ flex: 1, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: "20px 24px" },
    text(String(value), { fontSize: 44, fontWeight: 700, color: tone }),
    text(label, { color: C.dim, fontSize: 19, marginTop: 4 }),
  );
}

function panel(title: string, lines: ReactNode[], empty: string) {
  return col({ flex: 1, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 24 },
    text(title, { fontSize: 22, fontWeight: 700, marginBottom: 12 }),
    ...(lines.length ? lines : [text(empty, { color: C.dim, fontSize: 19 })]),
  );
}

const line = (left: string, right: string, tone: string = C.dim) =>
  row({ justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${C.line}`, gap: 16 },
    text(left, { fontSize: 19, flex: 1 }), text(right, { fontSize: 17, color: tone, flexShrink: 0 }));

/** "Thu 26 Nov 2026, 09:00 SGT" → "Thu 26 Nov, 09:00" (the header already says the year and the zone). */
const short = (label: string) => label.replace(/ \d{4},/, ",").replace(/ SGT$/, "");

function dashboard(d: Dashboard) {
  const name = (p: string) => NAMES[p] ?? p;
  const on = d.connections.filter((c) => c.connected).map((c) => name(c.platform));
  const off = d.connections.filter((c) => !c.connected).map((c) => name(c.platform));
  const conn = `Connected: ${on.join(", ") || "none"}${off.length ? `  ·  Reminders only: ${off.join(", ")}` : ""}`;
  return frame("Home overview", d.asOf.label, col({ gap: 20, flex: 1 },
    row({ gap: 16 },
      stat("Feeds", d.feeds.total), stat("Unread", d.feeds.unread), stat("New today", d.newArticlesToday),
      stat("Posted (30 days)", d.posts.posted30d, C.ecto), stat("Scheduled", d.posts.scheduled, C.candle),
      stat("Failed (7 days)", d.posts.failed7d, d.posts.failed7d ? C.danger : C.ink),
    ),
    row({ gap: 16, flex: 1 },
      panel("Up next", d.upNext.map((p) => line(`${NAMES[p.platform] ?? p.platform} · ${cut(p.title, 46)}`, p.status === "scheduled" ? short(p.at.label) : `${p.status} · ${short(p.at.label)}`, C.candle)), "Nothing scheduled."),
      panel("Recently posted", d.recentlyPosted.map((p) => line(`${NAMES[p.platform] ?? p.platform} · ${cut(p.title, 46)}`, short(p.at.label), C.ecto)), "No posts in the last 30 days."),
    ),
    row({ gap: 16 },
      panel("Read next", d.readNext.map((i) => line(cut(i.title, 70), `${i.feed} · ${i.score}`)), "No scored articles yet."),
    ),
    row({ justifyContent: "space-between" },
      text(`Feeds: ${d.feeds.alive} alive · ${d.feeds.sleeping} sleeping · ${d.feeds.broken} broken`, { color: C.dim, fontSize: 18 }),
      text(conn, { color: C.dim, fontSize: 18 })),
  ));
}

function posts(rows: PostRow[], asOf: string) {
  return frame("Posts: scheduled and recent", asOf, panel(
    `${rows.length} post${rows.length === 1 ? "" : "s"} (last 30 days and next 90)`,
    rows.slice(0, 14).map((p) =>
      line(`${NAMES[p.platform] ?? p.platform} · ${cut(p.text.split("\n")[0] || "Image post", 60)}${p.createdBy === "ai-assistant" ? "  (assistant)" : ""}`,
        `${p.status} · ${p.atSingapore.slice(0, 16).replace("T", " ")} SGT`,
        p.status === "posted" ? C.ecto : p.status === "failed" ? C.danger : C.candle)),
    "No posts yet.",
  ));
}

function feeds(rows: FeedRow[], asOf: string) {
  const tone = (s: string) => (s === "broken" ? C.danger : s === "dormant" ? C.candle : C.ecto);
  return frame("Feeds (graves)", asOf, panel(
    `${rows.length} feed${rows.length === 1 ? "" : "s"}`,
    [...rows].sort((a, b) => b.unreadCount - a.unreadCount).slice(0, 14).map((g) =>
      line(`${cut(g.title, 64)}${g.folder ? `  · ${g.folder}` : ""}`, `${g.status === "dormant" ? "sleeping" : g.status} · ${g.unreadCount} unread`, tone(g.status))),
    "No feeds yet.",
  ));
}

/** Renders one section as a PNG, base64-encoded for an MCP image block. */
export async function renderPage(page: Page, data: unknown, asOf: string): Promise<{ data: string; mimeType: "image/png"; width: number; height: number }> {
  const el = page === "dashboard" ? dashboard(data as Dashboard) : page === "posts" ? posts(data as PostRow[], asOf) : feeds(data as FeedRow[], asOf);
  const height = page === "dashboard" ? 900 : 860;
  const png = new ImageResponse(el as never, { width: W, height });
  return { data: Buffer.from(await png.arrayBuffer()).toString("base64"), mimeType: "image/png", width: W, height };
}
