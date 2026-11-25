"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle, ArrowRight, BookOpen, CalendarClock, Check, Circle, Clock, KeyRound, Plus, Rss, Send, Sparkles, X } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Activity, Overview as OverviewData } from "@backend/convex/dashboard";
import { PlatformIcon } from "@/components/brand/PlatformIcon";
import { BarChart, CHART_COLORS, ChartCard, LineChart, Sparkline } from "@/components/home/Charts";
import { timeAgo } from "@/components/crypt/ItemList";
import { Button } from "@/components/ui/button";
import { connectors as names, home as copy, witching } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useMinute } from "@/lib/useMinute";

const CHECKLIST_KEY = "necro.home.checklistHidden";
const noSubscribe = () => () => {};

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? copy.greetNight : h < 12 ? copy.greetMorning : h < 18 ? copy.greetAfternoon : copy.greetEvening;
}

function Card({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-h3 font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-meta font-semibold text-ecto-ink hover:underline">
      {label} <ArrowRight aria-hidden className="size-3.5" />
    </Link>
  );
}

function Stat({ label, value, href, tone, hint, trend, color }: { label: string; value: number | string; href: string; tone?: "warn" | "ok"; hint?: string; trend?: number[]; color?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col gap-1 rounded-2xl border bg-surface p-4 transition-colors hover:bg-surface-muted",
        tone === "warn" ? "border-candle" : "border-line",
      )}
    >
      <span className="text-meta font-semibold text-subtle">{label}</span>
      <span className="font-display text-[1.75rem] leading-9 font-bold text-ink tabular-nums">{value}</span>
      {hint ? <span className={cn("text-[0.75rem] font-semibold", tone === "warn" ? "text-candle" : "text-ecto-ink")}>{hint}</span> : null}
      {trend && trend.some((n) => n > 0) ? <Sparkline values={trend} color={color ?? CHART_COLORS.green} className="mt-auto pt-1" /> : null}
    </Link>
  );
}

function Checklist({ c, onHide }: { c: OverviewData["checklist"]; onHide: () => void }) {
  const steps = [
    { done: c.feeds, label: copy.stepFeeds, href: "/graveyard" },
    { done: c.interests, label: copy.stepInterests, href: "/settings#profile" },
    { done: c.voice, label: copy.stepVoice, href: "/settings#voice" },
    { done: c.connected, label: copy.stepConnect, href: "/settings#connections" },
    { done: c.firstPost, label: copy.stepPost, href: "/calendar?compose=1" },
    { done: c.mcpKey, label: copy.stepMcp, href: "/settings#keys" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section aria-labelledby="checklist-title" className="rounded-2xl border border-ecto-dim/40 bg-ecto/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="checklist-title" className="font-display text-h3 font-bold">{copy.checklistTitle}</h2>
          <p className="text-meta text-subtle">{copy.checklistProgress(done, steps.length)}</p>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={copy.hideChecklist} onClick={onHide}>
          <X aria-hidden />
        </Button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-ecto-dim transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-meta font-semibold transition-colors",
                s.done ? "border-transparent text-subtle line-through" : "border-line bg-surface text-ink hover:bg-surface-muted",
              )}
            >
              {s.done ? <Check aria-hidden className="size-4 text-ecto-ink" /> : <Circle aria-hidden className="size-4 text-subtle" />}
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

const STATUS_DOT: Record<string, string> = { scheduled: "bg-subtle", due: "bg-candle", posting: "bg-subtle", posted: "bg-ecto-dim", failed: "bg-danger" };

function PostRow({ p }: { p: OverviewData["upNext"][number] }) {
  return (
    <li className="flex items-center gap-3">
      <PlatformIcon platform={p.platform} brand className="size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-meta font-semibold text-ink">{p.title}</p>
        <p className="flex items-center gap-1.5 text-[0.75rem] text-subtle">
          <span className={cn("size-1.5 rounded-full", STATUS_DOT[p.status] ?? "bg-subtle")} aria-hidden />
          {witching.status[p.status] ?? p.status} · {witching.time(new Date(p.at))}
        </p>
      </div>
      {p.url ? (
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[0.75rem] font-semibold text-ecto-ink hover:underline">
          {copy.view}
        </a>
      ) : null}
    </li>
  );
}


const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const sum = (a: number[]) => a.reduce((n, v) => n + v, 0);

const METRICS = [
  { key: "risen", label: copy.seriesRisen, color: CHART_COLORS.green },
  { key: "ai", label: copy.seriesAi, color: CHART_COLORS.violet },
  { key: "posted", label: copy.seriesPosted, color: CHART_COLORS.amber },
  { key: "mcp", label: copy.seriesMcp, color: CHART_COLORS.blue },
] as const;

/** One metric at a time: segmented tabs, the 14-day total, change vs the week before, and one smooth line. */
function ActivityPanel({ activity, labels }: { activity: Activity | null | undefined; labels: string[] }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]["key"]>("risen");
  const m = METRICS.find((x) => x.key === metric)!;
  const values = activity?.[metric] ?? [];
  const total = sum(values);
  const thisWeek = sum(values.slice(-7));
  const lastWeek = sum(values.slice(-14, -7));
  const change = lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : thisWeek ? 100 : 0;
  return (
    <ChartCard title={copy.activityTitle} description={copy.activityDesc}>
      <div role="tablist" aria-label={copy.activityTitle} className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.05] p-1 sm:grid-cols-4">
        {METRICS.map((x) => (
          <button
            key={x.key}
            role="tab"
            type="button"
            aria-selected={metric === x.key}
            onClick={() => setMetric(x.key)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition-colors",
              metric === x.key ? "bg-white/[0.12] text-white shadow-sm" : "text-white/60 hover:text-white",
            )}
          >
            <span className="size-2 rounded-full" style={{ background: x.color }} aria-hidden />
            {x.label}
          </button>
        ))}
      </div>
      <div className="mt-5 flex items-end gap-3">
        <p className="text-[32px] leading-none font-[650] tracking-[-0.03em] tabular-nums">{activity ? total.toLocaleString() : "–"}</p>
        {activity ? (
          <span
            className={cn(
              "mb-0.5 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums",
              change > 0 ? "bg-[#6BC34E]/15 text-[#8DDB72]" : change < 0 ? "bg-[#F87171]/15 text-[#FCA5A5]" : "bg-white/10 text-white/70",
            )}
          >
            {change > 0 ? "↑" : change < 0 ? "↓" : ""} {Math.abs(change)}% {copy.vsLastWeek}
          </span>
        ) : null}
      </div>
      <div className="mt-4">
        {activity ? (
          <LineChart key={metric} ariaLabel={`${m.label}, ${copy.activityDesc}`} labels={labels} height={220} legend={false} series={[{ key: m.key, label: m.label, color: m.color, values }]} />
        ) : (
          <div className="h-[220px] animate-pulse rounded-lg bg-white/5" />
        )}
      </div>
    </ChartCard>
  );
}

type KeyRow ={ _id: string; name: string; prefix: string; scope: "read" | "write"; lastUsedAt?: number; revokedAt?: number; expiresAt: number | null };

function KeysCard({ keys, activity, now }: { keys: KeyRow[] | undefined; activity: Activity | null | undefined; now: number }) {
  const live = (keys ?? []).filter((k) => !k.revokedAt && !(k.expiresAt && k.expiresAt <= now));
  const off = (keys ?? []).length - live.length;
  const calls = activity?.mcp ?? [];
  const byKey = new Map((activity?.mcpByKey ?? []).map((r) => [r.keyId as string, r.calls]));
  const total = sum(calls);
  return (
    <ChartCard
      title={copy.keysTitle}
      description={copy.keysDesc(total)}
      action={
        <Link href="/settings#keys" className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#6BC34E] hover:underline">
          {copy.manage} <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      }
    >
      {activity ? (
        <BarChart ariaLabel={copy.keysChartLabel} labels={activity.days.map(dayLabel)} series={[{ key: "mcp", label: copy.seriesMcp, color: CHART_COLORS.blue, values: calls }]} height={120} />
      ) : (
        <div className="h-[120px] animate-pulse rounded-lg bg-white/5" />
      )}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {([
          [copy.keysActive, live.length],
          [copy.keysWrite, live.filter((k) => k.scope === "write").length],
          [copy.keysOff, off],
        ] as const).map(([l, n]) => (
          <div key={l} className="rounded-lg bg-white/[0.04] px-2 py-2">
            <p className="text-[18px] font-[650] tabular-nums">{n}</p>
            <p className="text-[11px] leading-tight text-white/60">{l}</p>
          </div>
        ))}
      </div>
      {live.length ? (
        <ul className="mt-3 flex flex-col divide-y divide-white/[0.06]">
          {live.slice(0, 4).map((k) => (
            <li key={k._id} className="flex items-center gap-2.5 py-2 text-[13px]">
              <KeyRound aria-hidden className="size-3.5 shrink-0 text-white/50" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{k.name}</p>
                <p className="truncate text-[11px] text-white/55">
                  {k.lastUsedAt ? copy.keyUsed(timeAgo(k.lastUsedAt)) : copy.keyNeverUsed}
                  {k.expiresAt ? ` · ${copy.keyExpires(new Date(k.expiresAt))}` : ""}
                </p>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", k.scope === "write" ? "bg-[#F59E0B]/20 text-[#F59E0B]" : "bg-white/10 text-white/70")}>
                {k.scope === "write" ? copy.scopeWrite : copy.scopeRead}
              </span>
              <span className="w-12 text-right leading-tight" title={copy.keyCallsTitle}>
                <span className="block text-[13px] font-semibold tabular-nums">{(byKey.get(k._id) ?? 0).toLocaleString()}</span>
                <span className="block text-[10px] text-white/50">{copy.calls}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-[13px] text-white/60">
          {copy.mcpNone}.{" "}
          <Link href="/settings#keys" className="font-semibold text-[#6BC34E] hover:underline">
            {copy.keysCreate}
          </Link>
        </p>
      )}
    </ChartCard>
  );
}

/** Home: your feeds, reading, posts, accounts and tools at a glance, live. */
export function Overview() {
  const minute = useMinute();
  const o = useQuery(api.dashboard.overview, { now: minute });
  const accounts = useQuery(api.social.list, {});
  const usage = useQuery(api.usage.today, {});
  const keys = useQuery(api.apiKeys.list, {});
  const activity = useQuery(api.dashboard.activity, { now: minute });
  const storedHidden = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return localStorage.getItem(CHECKLIST_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [hiddenNow, setHiddenNow] = useState(false);
  const hidden = storedHidden || hiddenNow;

  if (o === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-muted" />
        ))}
      </div>
    );
  }
  if (o === null) return null;

  const tools = usage
    ? ([
        ["seance", copy.toolSeance, Sparkles],
        ["resurrect", copy.toolResurrect, Send],
        ["caption", copy.toolCaption, Sparkles],
        ["ask", copy.toolAsk, BookOpen],
      ] as const).map(([k, label, Icon]) => ({ k, label, Icon, ...(usage as Record<string, { used: number; limit: number }>)[k] }))
    : [];
  const labels = activity?.days.map(dayLabel) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting + quick actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[1.75rem] leading-9 font-bold sm:text-h1">
            {greeting()}
            {o.name ? `, ${o.name}` : ""}
          </h1>
          <p className="mt-1 text-meta font-medium text-subtle">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · {copy.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/crypt">
              <BookOpen aria-hidden strokeWidth={1.75} /> {copy.actionRead}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/calendar?compose=1">
              <Plus aria-hidden strokeWidth={2} /> {copy.actionPost}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/graveyard">
              <Rss aria-hidden strokeWidth={1.75} /> {copy.actionSummon}
            </Link>
          </Button>
        </div>
      </div>

      {/* Things that need you */}
      {o.posts.due > 0 || o.feeds.broken > 0 || o.posts.failed7d > 0 ? (
        <div className="flex flex-col gap-2">
          {o.posts.due > 0 ? (
            <Link href="/calendar" className="flex items-center gap-2 rounded-xl border border-candle bg-candle/10 px-4 py-2.5 text-meta font-semibold text-ink hover:bg-candle/20">
              <Clock aria-hidden className="size-4 text-candle" /> {copy.dueBanner(o.posts.due)} <ArrowRight aria-hidden className="ml-auto size-4" />
            </Link>
          ) : null}
          {o.posts.failed7d > 0 ? (
            <Link href="/calendar" className="flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/5 px-4 py-2.5 text-meta font-semibold text-ink hover:bg-danger/10">
              <AlertTriangle aria-hidden className="size-4 text-danger" /> {copy.failedBanner(o.posts.failed7d)} <ArrowRight aria-hidden className="ml-auto size-4" />
            </Link>
          ) : null}
          {o.feeds.broken > 0 ? (
            <Link href="/graveyard?tab=doctor" className="flex items-center gap-2 rounded-xl border border-line bg-surface-muted px-4 py-2.5 text-meta font-semibold text-ink hover:bg-surface">
              <AlertTriangle aria-hidden className="size-4 text-candle" /> {copy.brokenBanner(o.feeds.broken)} <ArrowRight aria-hidden className="ml-auto size-4" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {hidden ? null : (
        <Checklist
          c={o.checklist}
          onHide={() => {
            setHiddenNow(true);
            try {
              localStorage.setItem(CHECKLIST_KEY, "1");
            } catch {
              // private window: it just stays hidden for this visit
            }
          }}
        />
      )}

      {/* Live numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={copy.statUnread} value={o.feeds.unread} href="/crypt" hint={copy.statFeeds(o.feeds.total)} />
        <Stat label={copy.statRisen} value={o.risenToday} href="/graveyard" hint={o.risenToday ? copy.statRisenHint : undefined} tone={o.risenToday ? "ok" : undefined} trend={activity?.risen} color={CHART_COLORS.green} />
        <Stat label={copy.statPosted} value={o.posts.posted30d} href="/calendar" hint={copy.statPostedHint} trend={activity?.posted} color={CHART_COLORS.blue} />
        <Stat
          label={copy.statScheduled}
          value={o.posts.scheduled}
          href="/calendar"
          tone={o.posts.due ? "warn" : undefined}
          hint={o.posts.due ? copy.statDue(o.posts.due) : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ActivityPanel activity={activity} labels={labels} />
        <KeysCard keys={keys} activity={activity} now={minute} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title={copy.readNextTitle} action={<MoreLink href="/crypt" label={copy.openCrypt} />}>
            {o.readNext.length ? (
              <ol className="flex flex-col gap-3">
                {o.readNext.map((i) => (
                  <li key={i._id}>
                    <Link href={`/crypt?item=${i._id}`} className="flex items-start gap-3 rounded-lg p-1 -m-1 hover:bg-surface-muted">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ecto/20 text-meta font-bold text-ecto-ink tabular-nums">{i.score}</span>
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-body font-semibold text-ink">{i.title}</span>
                        <span className="text-[0.75rem] text-subtle">{i.source}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-meta text-subtle">{o.feeds.total ? copy.readNextEmpty : copy.noFeeds}</p>
            )}
          </Card>

          <Card title={copy.postsTitle} action={<MoreLink href="/calendar" label={copy.openCalendar} />}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-meta font-bold text-subtle">
                  <CalendarClock aria-hidden className="size-4" /> {copy.upNext}
                </h3>
                {o.upNext.length ? <ul className="flex flex-col gap-3">{o.upNext.map((p) => <PostRow key={p._id} p={p} />)}</ul> : <p className="text-meta text-subtle">{copy.nothingNext}</p>}
              </div>
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-meta font-bold text-subtle">
                  <Check aria-hidden className="size-4" /> {copy.recent}
                </h3>
                {o.recent.length ? <ul className="flex flex-col gap-3">{o.recent.map((p) => <PostRow key={p._id} p={p} />)}</ul> : <p className="text-meta text-subtle">{copy.nothingRecent}</p>}
              </div>
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title={copy.accountsTitle} action={<MoreLink href="/settings#connections" label={copy.manage} />}>
            <ul className="flex flex-col gap-2.5">
              {(accounts ?? []).map((a) => (
                <li key={a.platform} className="flex items-center gap-3">
                  <PlatformIcon platform={a.platform} brand className="size-6 shrink-0" />
                  <div className="min-w-0 flex-1 text-meta">
                    <p className="truncate font-semibold text-ink">{names.names[a.platform]}</p>
                    <p className={cn("truncate text-[0.75rem]", a.connected && a.status !== "expired" ? "text-ecto-ink" : a.status === "expired" ? "text-danger" : "text-subtle")}>
                      {a.connected
                        ? a.status === "expired"
                          ? copy.accExpired
                          : copy.accConnected(a.username ? `@${a.username}` : a.name ?? "")
                        : a.configured
                          ? copy.accNotConnected
                          : copy.accSoon}
                    </p>
                  </div>
                  {!a.connected && a.configured ? (
                    <Link href="/settings#connections" className="text-[0.75rem] font-semibold text-ecto-ink hover:underline">
                      {copy.connect}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>

          <Card title={copy.toolsTitle} action={<MoreLink href="/settings#usage" label={copy.details} />}>
            <ul className="flex flex-col gap-3">
              {tools.map((t) => (
                <li key={t.k}>
                  <div className="flex items-center justify-between text-meta">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <t.Icon aria-hidden className="size-3.5 text-ecto-ink" /> {t.label}
                    </span>
                    <span className="text-subtle tabular-nums">
                      {t.used} / {t.limit}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                    <div className="h-full rounded-full bg-ecto-dim" style={{ width: `${Math.min(100, (t.used / Math.max(t.limit, 1)) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
