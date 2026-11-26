import "server-only";
import { createElement as h, type ReactNode } from "react";
import { ImageResponse } from "next/og";
// Relative on purpose (not "@/lib/copy"): the backend test suite imports this file too.
import { home as copy } from "../../../lib/copy";

// get_page_image: a live picture of one Necro section, drawn on Necro's server from the user's current data (the same
// query the page itself uses) and returned to the assistant as an MCP image block. Every call reads the database
// again, so the picture is always "now". It mirrors the real page: the same light theme colours (app/globals.css),
// the same cards in the same order and the same words (lib/copy.ts `home`), and the same Activity chart (the same
// series, colours and labels as components/home/Charts.tsx). Only buttons and links are left out. Same renderer as
// /api/post-image (next/og), no browser, no cookies. get_page_image uses this only when the real browser screenshot
// fails, and then says so ("renderer": "fallback").

export const PAGES = ["dashboard", "analytics", "posts", "feeds"] as const;
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
  series?: { days: string[]; newArticles: number[]; postsPosted: number[]; aiToolUses: number[]; mcpCalls: number[] };
};

// components/home/Charts.tsx CHART_COLORS, and the Activity chart's series in the same order.
const CHART = { green: "#6BC34E", blue: "#60A5FA", amber: "#F59E0B", violet: "#A78BFA", grid: "#e6e1ec", label: "#5e5670" };
const SERIES = [
  { key: "newArticles", label: copy.seriesRisen, color: CHART.green },
  { key: "postsPosted", label: copy.seriesPosted, color: CHART.blue },
  { key: "aiToolUses", label: copy.seriesAi, color: CHART.amber },
  { key: "mcpCalls", label: copy.seriesMcp, color: CHART.violet },
] as const;

/** Same round axis maximum as Charts.tsx niceMax. */
function niceMax(v: number): number {
  if (v <= 0) return 4;
  const raw = (v * 1.1) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const step = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p);
  return Math.ceil(step) * 4;
}

const dayLabel = (d: string) => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(d.slice(8, 10))} ${months[Number(d.slice(5, 7)) - 1]}`;
};

/** A line chart: grid and lines as SVG (satori renders inline SVG, but not <text>), labels as positioned boxes. */
function lineChart(days: string[], series: { label: string; color: string; values: number[] }[], width: number, height: number) {
  const pad = { l: 44, r: 12, t: 10, b: 28 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i: number) => pad.l + (days.length <= 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const lines: ReactNode[] = [];
  const labels: ReactNode[] = [];
  const label = (text: string, left: number, top: number, align: "left" | "center" | "right") =>
    box({ position: "absolute", left: align === "left" ? left : align === "center" ? left - 40 : left - 80, top, width: align === "left" ? 80 : 80, justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start", fontSize: 13, color: CHART.label }, text);
  for (const tick of [0, 1, 2, 3, 4].map((i) => (max / 4) * i)) {
    lines.push(h("line", { key: `g${tick}`, x1: pad.l, x2: width - pad.r, y1: y(tick), y2: y(tick), stroke: CHART.grid, strokeWidth: 1, ...(tick ? { strokeDasharray: "3 5" } : {}) }));
    labels.push(label(String(Math.round(tick)), pad.l - 8, y(tick) - 9, "right"));
  }
  const step = Math.max(1, Math.ceil(days.length / 7));
  days.forEach((d, i) => {
    if (i % step === 0 || i === days.length - 1) labels.push(label(dayLabel(d), x(i), height - 20, i === days.length - 1 ? "right" : "center"));
  });
  for (const s of series) {
    const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    lines.push(h("path", { key: s.label, d, fill: "none", stroke: s.color, strokeWidth: 3, strokeLinejoin: "round", strokeLinecap: "round" }));
  }
  return box({ position: "relative", width, height }, h("svg", { width, height, viewBox: `0 0 ${width} ${height}` }, ...lines), ...labels);
}

function activityCard(d: Dashboard, width: number, height: number) {
  const s = d.series;
  if (!s) return card(copy.activityTitle, [t("No chart data.", { fontSize: 16, color: C.subtle })]);
  const series = SERIES.map((x) => ({ label: x.label, color: x.color, values: s[x.key] }));
  return card(copy.activityTitle, [
    box({ gap: 18, marginBottom: 10 }, ...series.map((x) => box({ alignItems: "center", gap: 6 },
      box({ width: 10, height: 10, borderRadius: 10, background: x.color }),
      t(`${x.label} ${x.values.reduce((a, b) => a + b, 0)}`, { fontSize: 15, color: C.copy }),
    ))),
    lineChart(s.days, series, width, height),
  ]);
}
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
    box({ marginBottom: 18 }, activityCard(d, W - 88 - 46, 220)),
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

function analytics(d: Dashboard) {
  return col({ width: "100%", height: "100%", background: C.bg, padding: 44, fontFamily: "sans-serif" },
    header(copy.activityTitle, "The Home charts: last 14 days, per day", d.asOf.label),
    activityCard(d, W - 88 - 46, 520),
  );
}

/** Renders one section as a PNG, base64-encoded for an MCP image block. */
export async function renderPage(page: Page, data: unknown, asOf: string): Promise<{ data: string; mimeType: "image/png"; width: number; height: number }> {
  const el =
    page === "dashboard" ? dashboard(data as Dashboard)
      : page === "analytics" ? analytics(data as Dashboard)
        : page === "posts" ? posts(data as PostRow[], asOf)
          : feeds(data as FeedRow[], asOf);
  const height = page === "dashboard" ? 1290 : page === "analytics" ? 800 : 900;
  const png = new ImageResponse(el as never, { width: W, height });
  return { data: Buffer.from(await png.arrayBuffer()).toString("base64"), mimeType: "image/png", width: W, height };
}
