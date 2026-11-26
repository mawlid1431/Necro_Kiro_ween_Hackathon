import "server-only";
import { createElement as h, type ReactNode } from "react";
import { ImageResponse } from "next/og";
// Relative on purpose (not "@/lib/copy"): the backend test suite imports this file too.
import { home as copy } from "../../../lib/copy";

// get_page_image: a live picture of one Necro section, drawn on Necro's server from the user's current data (the same
// query the page itself uses) and returned to the assistant as an MCP image block. Every call reads the database
// again, so the picture is always "now". It mirrors the real page: the same light theme colours (app/globals.css),
// the same cards in the same order and the same words (lib/copy.ts `home`). Only the interactive parts (buttons,
// the activity chart, links) are left out. Same renderer as /api/post-image (next/og), no browser, no cookies.

export const PAGES = ["dashboard", "posts", "feeds"] as const;
export type Page = (typeof PAGES)[number];

const W = 1200;
// Light theme tokens from app/globals.css.
const C = {
  bg: "#faf8f3", surface: "#ffffff", muted: "#f7f4ee", line: "#e6e1ec", ink: "#0d0a14", copy: "#2a2236", subtle: "#5e5670",
  ecto: "#7cf29a", ectoInk: "#2f7346", candle: "#f5a524", candleInk: "#8a5a00", danger: "#c8343a", midnight: "#0d0a14",
};

type Zoned = { label: string; singapore: string };
type Dashboard = {
  asOf: Zoned;
  feeds: { total: number; alive: number; sleeping: number; broken: number; unread: number };
  newArticlesToday: number;
  posts: { posted30d: number; scheduled: number; due: number; failed7d: number };
  upNext: { platform: string; status: string; title: string; delivery: string; at: Zoned }[];
  recentlyPosted: { platform: string; title: string; at: Zoned }[];
  readNext: { title: string; feed: string; score: number }[];
  connections: { platform: string; connected: boolean; status?: string; account?: string | null }[];
};
type PostRow = { platform: string; status: string; delivery: string; atSingapore: string; text: string; createdBy: string; hasImage: boolean };
type FeedRow = { title: string; status: string; unreadCount: number; folder: string | null };

const NAMES: Record<string, string> = { linkedin: "LinkedIn", x: "X (Twitter)", instagram: "Instagram", tiktok: "TikTok" };
const BRAND: Record<string, string> = { linkedin: "#0a66c2", x: "#0d0a14", instagram: "#d62976", tiktok: "#111111" };
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const box = (style: Record<string, unknown>, ...children: ReactNode[]) => h("div", { style: { display: "flex", ...style } }, ...children);
const col = (style: Record<string, unknown>, ...children: ReactNode[]) => box({ flexDirection: "column", ...style }, ...children);
const t = (text: string, style: Record<string, unknown> = {}) => box({ color: C.copy, fontSize: 18, ...style }, text);

/** "Thu 26 Nov 2026, 09:00 SGT" → "Thu 26 Nov, 09:00". */
const short = (label: string) => label.replace(/ \d{4},/, ",").replace(/ SGT$/, "");

/** The Singapore wall clock behind a zoned time: Home greets by the hour and shows the weekday and date. */
function sgParts(z: Zoned) {
  const [date, time] = z.singapore.split("T");
  const d = new Date(`${date}T00:00:00Z`);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return { hour: Number(time.slice(0, 2)), day: `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}` };
}

const card = (title: string, children: ReactNode[], style: Record<string, unknown> = {}) =>
  col({ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22, ...style }, t(title, { fontSize: 21, fontWeight: 700, color: C.ink, marginBottom: 14 }), ...children);

const dot = (platform: string) => box({ width: 22, height: 22, borderRadius: 6, background: BRAND[platform] ?? C.subtle, flexShrink: 0 });

function header(title: string, subtitle: string, asOf: string) {
  return box(
    { justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 },
    col({},
      box({ alignItems: "center", gap: 10, marginBottom: 14 },
        box({ width: 30, height: 34, borderRadius: "15px 15px 4px 4px", background: C.midnight }),
        t("NECRO", { fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: 4 }),
      ),
      t(title, { fontSize: 38, fontWeight: 700, color: C.ink }),
      t(subtitle, { fontSize: 18, color: C.subtle, marginTop: 4 }),
    ),
    box({ background: C.muted, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 14px", alignItems: "center", gap: 8 },
      box({ width: 9, height: 9, borderRadius: 9, background: C.ecto }),
      t(`Live · ${asOf}`, { fontSize: 15, color: C.subtle }),
    ),
  );
}

function stat(label: string, value: number, hint?: string, tone?: "ok" | "warn") {
  return col({ flex: 1, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: "18px 22px" },
    t(label, { fontSize: 16, color: C.subtle, fontWeight: 600 }),
    t(String(value), { fontSize: 42, fontWeight: 700, color: tone === "ok" ? C.ectoInk : tone === "warn" ? C.candleInk : C.ink, marginTop: 2 }),
    hint ? t(hint, { fontSize: 15, color: tone === "warn" ? C.candleInk : C.subtle }) : t(" ", { fontSize: 15 }),
  );
}

function postLine(p: { platform: string; title: string; at: Zoned; note?: string }, tone: string) {
  return box({ gap: 10, alignItems: "flex-start", marginBottom: 10 },
    dot(p.platform),
    col({ flex: 1 },
      t(cut(p.title, 48), { fontSize: 17, fontWeight: 600, color: C.ink }),
      t(`${NAMES[p.platform] ?? p.platform} · ${short(p.at.label)}${p.note ? ` · ${p.note}` : ""}`, { fontSize: 14, color: tone }),
    ),
  );
}

function dashboard(d: Dashboard) {
  const { hour, day } = sgParts(d.asOf);
  const greeting = hour < 5 ? copy.greetNight : hour < 12 ? copy.greetMorning : hour < 18 ? copy.greetAfternoon : copy.greetEvening;
  const accText = (c: Dashboard["connections"][number]) =>
    c.status === "expired" ? copy.accExpired
      : c.connected ? copy.accConnected(c.account ?? "")
        : c.status === "coming soon" ? copy.accSoon : copy.accNotConnected;
  const accTone = (c: Dashboard["connections"][number]) => (c.status === "expired" ? C.danger : c.connected ? C.ectoInk : C.subtle);

  return col({ width: "100%", height: "100%", background: C.bg, padding: 44, fontFamily: "sans-serif" },
    header(greeting, `${day} · ${copy.subtitle}`, d.asOf.label),
    // Live numbers: the same four cards as Home.
    box({ gap: 14, marginBottom: 18 },
      stat(copy.statUnread, d.feeds.unread, copy.statFeeds(d.feeds.total)),
      stat(copy.statRisen, d.newArticlesToday, d.newArticlesToday ? copy.statRisenHint : undefined, d.newArticlesToday ? "ok" : undefined),
      stat(copy.statPosted, d.posts.posted30d, copy.statPostedHint),
      stat(copy.statScheduled, d.posts.scheduled, d.posts.due ? copy.statDue(d.posts.due) : undefined, d.posts.due ? "warn" : undefined),
    ),
    box({ gap: 18, flex: 1 },
      col({ flex: 1, gap: 18 },
        card(copy.readNextTitle, d.readNext.length
          ? d.readNext.map((i) => box({ gap: 12, alignItems: "flex-start", marginBottom: 10 },
              box({ width: 40, height: 40, borderRadius: 10, background: "rgba(124,242,154,0.25)", alignItems: "center", justifyContent: "center", color: C.ectoInk, fontSize: 16, fontWeight: 700, flexShrink: 0 }, String(i.score)),
              col({ flex: 1 }, t(cut(i.title, 70), { fontSize: 17, fontWeight: 600, color: C.ink }), t(i.feed, { fontSize: 14, color: C.subtle })),
            ))
          : [t(d.feeds.total ? copy.readNextEmpty : copy.noFeeds, { fontSize: 16, color: C.subtle })]),
        card(copy.postsTitle, [
          box({ gap: 22 },
            col({ flex: 1 },
              t(copy.upNext, { fontSize: 15, fontWeight: 700, color: C.subtle, marginBottom: 10 }),
              ...(d.upNext.length
                ? d.upNext.map((p) => postLine({ ...p, note: p.delivery === "reminder" ? "reminder" : p.status === "scheduled" ? undefined : p.status }, C.candleInk))
                : [t(copy.nothingNext, { fontSize: 16, color: C.subtle })]),
            ),
            col({ flex: 1 },
              t(copy.recent, { fontSize: 15, fontWeight: 700, color: C.subtle, marginBottom: 10 }),
              ...(d.recentlyPosted.length ? d.recentlyPosted.map((p) => postLine(p, C.ectoInk)) : [t(copy.nothingRecent, { fontSize: 16, color: C.subtle })]),
            ),
          ),
        ], { flex: 1 }),
      ),
      col({ width: 330, gap: 18 },
        card(copy.accountsTitle, d.connections.map((c) => box({ gap: 12, alignItems: "center", marginBottom: 12 },
          dot(c.platform),
          col({}, t(NAMES[c.platform] ?? c.platform, { fontSize: 17, fontWeight: 600, color: C.ink }), t(cut(accText(c), 34), { fontSize: 14, color: accTone(c) })),
        ))),
        card("Feeds", [
          t(`${d.feeds.alive} alive · ${d.feeds.sleeping} sleeping · ${d.feeds.broken} broken`, { fontSize: 16, color: C.copy }),
          d.posts.failed7d ? t(`${d.posts.failed7d} post${d.posts.failed7d === 1 ? "" : "s"} failed in the last 7 days`, { fontSize: 15, color: C.danger, marginTop: 8 }) : t(" ", { fontSize: 6 }),
        ]),
      ),
    ),
  );
}

const STATUS_TONE: Record<string, string> = { posted: C.ectoInk, failed: C.danger, canceled: C.subtle, scheduled: C.candleInk, due: C.candleInk, posting: C.candleInk };

function posts(rows: PostRow[], asOf: string) {
  const list = rows.slice(0, 12);
  return col({ width: "100%", height: "100%", background: C.bg, padding: 44, fontFamily: "sans-serif" },
    header("Witching Hour", "Your scheduled, sent and cancelled posts (last 30 days and next 90), in Singapore time", asOf),
    card(`${rows.length} post${rows.length === 1 ? "" : "s"}`, list.length
      ? list.map((p) => box({ gap: 12, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${C.line}` },
          dot(p.platform),
          col({ flex: 1 },
            t(cut(p.text.split("\n")[0] || "Image post", 70), { fontSize: 17, fontWeight: 600, color: C.ink }),
            t(`${NAMES[p.platform] ?? p.platform}${p.hasImage ? " · with image" : ""}${p.delivery === "reminder" ? " · reminder" : ""}${p.createdBy === "ai-assistant" ? " · by your assistant" : ""}`, { fontSize: 14, color: C.subtle }),
          ),
          col({ alignItems: "flex-end", flexShrink: 0 },
            t(p.status, { fontSize: 15, fontWeight: 700, color: STATUS_TONE[p.status] ?? C.subtle }),
            t(`${p.atSingapore.slice(0, 16).replace("T", " ")} SGT`, { fontSize: 14, color: C.subtle }),
          ),
        ))
      : [t(copy.nothingNext, { fontSize: 16, color: C.subtle })], { flex: 1 }),
  );
}

function feeds(rows: FeedRow[], asOf: string) {
  const tone = (s: string) => (s === "broken" ? C.danger : s === "dormant" ? C.candleInk : C.ectoInk);
  const list = [...rows].sort((a, b) => b.unreadCount - a.unreadCount).slice(0, 12);
  return col({ width: "100%", height: "100%", background: C.bg, padding: 44, fontFamily: "sans-serif" },
    header("Graveyard", "Your feeds, most unread first", asOf),
    card(`${rows.length} feed${rows.length === 1 ? "" : "s"}`, list.length
      ? list.map((g) => box({ gap: 12, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${C.line}` },
          box({ width: 10, height: 10, borderRadius: 10, background: tone(g.status), flexShrink: 0 }),
          col({ flex: 1 }, t(cut(g.title, 70), { fontSize: 17, fontWeight: 600, color: C.ink }), g.folder ? t(g.folder, { fontSize: 14, color: C.subtle }) : t(" ", { fontSize: 4 })),
          col({ alignItems: "flex-end", flexShrink: 0 },
            t(g.status === "dormant" ? "sleeping" : g.status, { fontSize: 15, fontWeight: 700, color: tone(g.status) }),
            t(`${g.unreadCount} unread`, { fontSize: 14, color: C.subtle }),
          ),
        ))
      : [t(copy.noFeeds, { fontSize: 16, color: C.subtle })], { flex: 1 }),
  );
}

/** Renders one section as a PNG, base64-encoded for an MCP image block. */
export async function renderPage(page: Page, data: unknown, asOf: string): Promise<{ data: string; mimeType: "image/png"; width: number; height: number }> {
  const el = page === "dashboard" ? dashboard(data as Dashboard) : page === "posts" ? posts(data as PostRow[], asOf) : feeds(data as FeedRow[], asOf);
  const height = page === "dashboard" ? 980 : 900;
  const png = new ImageResponse(el as never, { width: W, height });
  return { data: Buffer.from(await png.arrayBuffer()).toString("base64"), mimeType: "image/png", width: W, height };
}
