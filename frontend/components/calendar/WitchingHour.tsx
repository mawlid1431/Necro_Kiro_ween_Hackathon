"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Share2 } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { TimelineEntry } from "@backend/convex/social";
import { PlatformIcon } from "@/components/brand/PlatformIcon";
import { toLocalInput } from "@/components/crypt/ScheduleControl";
import { Composer } from "./Composer";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Notice } from "@/components/ui/field";
import { composer, connectors as names, witching as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { shareByHand, shareSheet, type ShareImage } from "@/lib/share";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

/** The current time, ticking every 30 s, so "now", "due" and "in 5 min" stay live without a reload. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);
const hm = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const hostOf = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-surface-muted text-copy",
  due: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  posting: "bg-surface-muted text-copy",
  posted: "bg-ecto/20 text-ecto-ink",
  failed: "bg-danger/10 text-danger",
  canceled: "bg-surface-muted text-subtle line-through",
};

/** The 6-week grid (Monday first) that contains `month`. */
function monthGrid(year: number, month: number): number[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - offset).getTime();
  return Array.from({ length: 42 }, (_, i) => new Date(start + i * DAY + 2 * 3_600_000).setHours(0, 0, 0, 0));
}

function Entry({ e, now }: { e: TimelineEntry; now: number }) {
  const cancel = useMutation(api.social.cancelScheduled);
  const reschedule = useMutation(api.social.reschedule);
  const markShared = useMutation(api.social.markShared);
  const { confirm } = useConfirm();
  const [moving, setMoving] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(Math.max(e.at, now + 10 * 60_000)));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const pending = e.status === "scheduled" || e.status === "due";
  const minutes = Math.round((e.at - now) / 60_000);

  const run = async (f: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await f();
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    }
  };

  async function shareNow() {
    // Your own uploaded image (composer posts), or the generated article image.
    const image: ShareImage | undefined = e.imageUrl ? { url: e.imageUrl } : e.kind === "article" ? { title: e.itemTitle, source: e.source || hostOf(e.link) } : undefined;
    const visual = e.platform === "instagram" || e.platform === "tiktok" || !!e.imageUrl;
    // Phones: the share sheet (with the image). Desktop: the composer, or copy + saved image.
    if (await shareSheet({ title: e.itemTitle, text: e.post, url: e.link, image: visual ? image : undefined })) {
      setMsg({ ok: true, text: copy.copied });
      return;
    }
    const r = await shareByHand(e.platform, e.post, image);
    setMsg(r.opened ? { ok: true, text: copy.copied } : { ok: false, text: copy.popupBlocked });
  }

  return (
    <li className={cn("rounded-lg border bg-surface p-3", e.status === "due" ? "border-amber-400" : "border-line")}>
      <div className="flex items-start gap-3">
        <PlatformIcon platform={e.platform} brand className="mt-0.5 size-6 shrink-0" />
        {e.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the user's own uploaded image
          <img src={e.imageUrl} alt="" className="size-14 shrink-0 rounded-md border border-line object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-meta">
            <span className="font-semibold text-ink">{copy.time(new Date(e.at))}</span>
            {pending && minutes > 0 ? <span className="text-subtle">{copy.inMinutes(minutes)}</span> : null}
            <span className={cn("rounded-full px-2 py-0.5 text-[0.75rem] font-semibold", STATUS_STYLE[e.status])}>{copy.status[e.status] ?? e.status}</span>
            {pending ? <span className="text-[0.75rem] text-subtle">{e.mode === "auto" ? copy.autoTag : copy.reminderTag}</span> : null}
          </div>
          <button type="button" onClick={() => setOpen(!open)} className="mt-1 block text-left text-body font-semibold text-ink hover:underline">
            {e.itemTitle}
          </button>
          <p className="text-meta text-subtle">
            {names.names[e.platform]}
            {e.source ? ` · ${e.source}` : ""}
          </p>
          {open ? <p className="mt-2 rounded-md bg-surface-muted p-2 text-meta whitespace-pre-line text-copy">{e.post}</p> : null}
          {e.status === "failed" && e.error ? <p className="mt-1 text-meta text-danger">{e.error}</p> : null}

          <div className="mt-2 flex flex-wrap gap-2">
            {e.status === "due" ? (
              <>
                <Button size="sm" onClick={() => void shareNow()}>
                  <Share2 aria-hidden strokeWidth={1.75} /> {copy.shareNow}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void run(() => markShared({ publishId: e._id }))}>
                  {copy.markDone}
                </Button>
              </>
            ) : null}
            {pending ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setMoving(!moving)}>
                  {copy.move}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    if (await confirm({ title: copy.confirmCancel, body: copy.confirmCancelBody, tone: "danger", confirmLabel: copy.confirmCancelYes })) {
                      await run(() => cancel({ publishId: e._id }));
                    }
                  }}
                >
                  {copy.cancelPost}
                </Button>
              </>
            ) : null}
            {e.status === "posted" && e.url ? (
              <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-meta font-semibold text-ecto-ink hover:underline">
                {copy.viewPost} <ExternalLink aria-hidden className="size-3.5" />
              </a>
            ) : null}
          </div>
          {moving ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="datetime-local"
                value={when}
                min={toLocalInput(now + 2 * 60_000)}
                onChange={(ev) => setWhen(ev.target.value)}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-meta"
              />
              <Button
                size="sm"
                onClick={() =>
                  void run(async () => {
                    await reschedule({ publishId: e._id, at: new Date(when).getTime() });
                    setMoving(false);
                  })
                }
              >
                {copy.save}
              </Button>
            </div>
          ) : null}
          {msg ? (
            <div className="mt-2">
              <Notice tone={msg.ok ? "ok" : "error"}>{msg.text}</Notice>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Witching Hour: the month calendar of scheduled and published posts, plus a live timeline. */
export function WitchingHour() {
  const now = useNow();
  const [view, setView] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState(() => startOfDay(Date.now()));
  // Home and the checklist link to /calendar?compose=1 to open the composer straight away.
  const params = useSearchParams();
  const [composing, setComposing] = useState(() => params.get("compose") === "1");
  const cells = useMemo(() => monthGrid(view.y, view.m), [view]);
  // Stable query ranges (not "now", which ticks), so the live subscription is not re-created every 30 s.
  const monthRange = useMemo(() => ({ from: cells[0], to: cells[41] + DAY - 1 }), [cells]);
  const [listRange] = useState(() => {
    const t = startOfDay(Date.now());
    return { from: t - 60 * DAY, to: t + 91 * DAY };
  });
  const month = useQuery(api.social.timeline, monthRange);
  const list = useQuery(api.social.timeline, listRange);

  const byDay = useMemo(() => {
    const m = new Map<number, TimelineEntry[]>();
    for (const e of month ?? []) {
      const k = startOfDay(e.at);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.at - b.at);
    return m;
  }, [month]);
  const upNext = (list ?? []).filter((e) => e.status === "scheduled" || e.status === "due" || e.status === "posting").sort((a, b) => a.at - b.at);
  const past = (list ?? []).filter((e) => !(e.status === "scheduled" || e.status === "due" || e.status === "posting")).sort((a, b) => b.at - a.at);
  const dayItems = byDay.get(selected) ?? [];
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const shift = (d: number) => setView(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Composer open={composing} onOpenChange={setComposing} />
      <section aria-label={monthLabel} className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center gap-2">
          <h2 className="mr-auto font-display text-h3 font-bold">{monthLabel}</h2>
          <Button size="sm" onClick={() => setComposing(true)}>
            <Plus aria-hidden strokeWidth={2} /> {composer.open}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { const d = new Date(); setView({ y: d.getFullYear(), m: d.getMonth() }); setSelected(startOfDay(Date.now())); }}>
            {copy.today}
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={copy.prev} onClick={() => shift(-1)}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={copy.next} onClick={() => shift(1)}>
            <ChevronRight aria-hidden />
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <div className="grid grid-cols-7 border-b border-line bg-surface-muted text-center text-[0.75rem] font-semibold text-subtle">
            {copy.weekdays.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day) => {
              const items = byDay.get(day) ?? [];
              const inMonth = new Date(day).getMonth() === view.m;
              const isToday = sameDay(day, now);
              const isSel = day === selected;
              const due = items.some((e) => e.status === "due");
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelected(day)}
                  aria-pressed={isSel}
                  aria-label={`${new Date(day).toDateString()}: ${items.length}`}
                  className={cn(
                    "flex min-h-20 flex-col gap-1 border-r border-b border-line p-1.5 text-left transition-colors last:border-r-0 sm:min-h-24 [&:nth-child(7n)]:border-r-0",
                    inMonth ? "bg-surface" : "bg-surface-muted/50 text-subtle",
                    isSel && "ring-2 ring-ecto-dim ring-inset",
                    "hover:bg-surface-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-6 place-items-center rounded-full text-[0.75rem] font-semibold",
                      isToday ? "bg-ecto text-ink" : "",
                      due && !isToday ? "bg-amber-200 text-amber-950" : "",
                    )}
                  >
                    {new Date(day).getDate()}
                  </span>
                  {items.slice(0, 3).map((e) => (
                    <span key={e._id} className={cn("hidden items-center gap-1 truncate rounded px-1 py-0.5 text-[0.6875rem] font-semibold sm:flex", STATUS_STYLE[e.status])}>
                      <PlatformIcon platform={e.platform} className="size-3 shrink-0" />
                      {hm(e.at)}
                    </span>
                  ))}
                  {items.length ? (
                    <span className="flex gap-0.5 sm:hidden" aria-hidden>
                      {items.slice(0, 4).map((e) => (
                        <span key={e._id} className={cn("size-1.5 rounded-full", e.status === "posted" ? "bg-ecto-dim" : e.status === "failed" ? "bg-danger" : e.status === "due" ? "bg-amber-500" : "bg-subtle")} />
                      ))}
                    </span>
                  ) : null}
                  {items.length > 3 ? <span className="hidden text-[0.6875rem] text-subtle sm:block">+{items.length - 3}</span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-meta font-bold tracking-[0.08em] text-subtle uppercase">{new Date(selected).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</h3>
          {month === undefined ? null : dayItems.length ? (
            <ul className="flex flex-col gap-2">
              {dayItems.map((e) => (
                <Entry key={e._id} e={e} now={now} />
              ))}
            </ul>
          ) : (
            <p className="text-meta text-subtle">{copy.dayEmpty}</p>
          )}
        </div>
      </section>

      <aside className="flex min-w-0 flex-col gap-6">
        <section>
          <h2 className="mb-2 font-display text-h3 font-bold">{copy.upNext}</h2>
          {list === undefined ? (
            <div className="h-24 animate-pulse rounded-lg bg-surface-muted" />
          ) : upNext.length ? (
            <ul className="flex flex-col gap-2">
              {upNext.map((e) => (
                <Entry key={e._id} e={e} now={now} />
              ))}
            </ul>
          ) : (
            <p className="text-meta text-subtle">{copy.nothingNext}</p>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-display text-h3 font-bold">{copy.history}</h2>
          {list === undefined ? null : past.length ? (
            <ol className="relative flex flex-col gap-3 border-l-2 border-line pl-4">
              <li className="-ml-[1.4rem] flex items-center gap-2 text-[0.75rem] font-bold text-ecto-ink">
                <span className="size-3 rounded-full bg-ecto ring-4 ring-ecto/25" aria-hidden /> {copy.now} · {hm(now)}
              </li>
              {past.map((e) => (
                <li key={e._id} className="relative">
                  <span className={cn("absolute top-2 -left-[1.42rem] size-2.5 rounded-full", e.status === "posted" ? "bg-ecto-dim" : e.status === "failed" ? "bg-danger" : "bg-subtle")} aria-hidden />
                  <ul>
                    <Entry e={e} now={now} />
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-meta text-subtle">{copy.nothingPast}</p>
          )}
        </section>
      </aside>
    </div>
  );
}
