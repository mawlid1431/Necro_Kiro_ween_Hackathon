"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Bell, BellOff, Eye, Trash2 } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { timeAgo } from "@/components/crypt/ItemList";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Card, Input, Label, Notice } from "@/components/ui/field";
import { omens as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** Omens: watched topics, their matches, and opt-in browser notifications. */
export function Omens() {
  const list = useQuery(api.omens.list, {});
  const [filter, setFilter] = useState<Id<"omens"> | undefined>();
  const matches = useQuery(api.omens.matches, { omenId: filter });
  const markSeen = useMutation(api.omens.markSeen);
  const unseen = matches?.some((m) => !m.seen);

  // Looking at the page counts as seeing the matches (clears the nav badge).
  useEffect(() => {
    if (unseen) void markSeen({});
  }, [unseen, markSeen]);

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-2xl text-copy">{copy.intro}</p>
      <AddOmen />

      <section aria-labelledby="omens-h" className="flex flex-col gap-3">
        <h2 id="omens-h" className="font-display text-h3 font-bold">{copy.yours}</h2>
        {list === undefined ? <div className="h-16 animate-pulse rounded-xl bg-surface-muted/60" /> : null}
        {list && !list.length ? <Notice>{copy.none}</Notice> : null}
        {list && list.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {list.map((o) => (
              <OmenRow key={o._id} omen={o} active={filter === o._id} onFilter={() => setFilter(filter === o._id ? undefined : o._id)} />
            ))}
          </ul>
        ) : null}
        <NotifyToggle />
      </section>

      <section aria-labelledby="matches-h" className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 id="matches-h" className="font-display text-h3 font-bold">{copy.matches}</h2>
          {filter ? (
            <Button variant="ghost" size="sm" onClick={() => setFilter(undefined)}>
              {copy.allTopics}
            </Button>
          ) : null}
        </div>
        {matches === undefined ? <div className="h-32 animate-pulse rounded-xl bg-surface-muted/60" /> : null}
        {matches && !matches.length ? <Notice>{copy.noMatches}</Notice> : null}
        {matches && matches.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
            {matches.map((m) => (
              <li key={m._id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-overline font-bold tracking-[0.12em] text-ecto-ink uppercase">
                    {m.topic}
                    <span className="ml-2 font-semibold tracking-normal text-subtle normal-case">· {copy.via[m.via]}</span>
                  </p>
                  <p className={cn("mt-0.5 font-semibold", m.seen ? "text-copy" : "text-ink")}>{m.title}</p>
                  <p className="text-meta text-subtle">
                    {m.graveTitle} · {timeAgo(m.publishedAt)} · {m.reason}
                  </p>
                </div>
                <Button asChild size="sm" variant="secondary" className="self-start sm:self-center">
                  <Link href={`/crypt?item=${m.itemId}`}>
                    <Eye aria-hidden strokeWidth={1.75} /> {copy.read}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function AddOmen() {
  const create = useMutation(api.omens.create);
  const [topic, setTopic] = useState("");
  const [strict, setStrict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create({ topic, strict });
      setTopic("");
      setStrict(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div>
          <Label htmlFor="omen-topic">{copy.topic}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="omen-topic" required minLength={3} maxLength={60} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={copy.topicPlaceholder} />
            <Button type="submit" disabled={busy || topic.trim().length < 3} className="shrink-0">
              {busy ? copy.adding : copy.add}
            </Button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-meta text-copy">
          <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} className="accent-ecto-dim" />
          {copy.strict}
        </label>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </form>
    </Card>
  );
}

type OmenView = NonNullable<ReturnType<typeof useQuery<typeof api.omens.list>>>[number];

function OmenRow({ omen, active, onFilter }: { omen: OmenView; active: boolean; onFilter: () => void }) {
  const update = useMutation(api.omens.update);
  const remove = useMutation(api.omens.remove);
  const { confirm } = useConfirm();
  return (
    <li className={cn("flex items-center gap-2 rounded-xl border bg-surface px-4 py-3", active ? "border-ecto-dim" : "border-line", omen.muted && "opacity-60")}>
      <button onClick={onFilter} aria-pressed={active} className="min-w-0 flex-1 text-left">
        <p className="truncate font-semibold text-ink">{omen.topic}</p>
        <p className="text-meta text-subtle">
          {copy.matchCount(omen.matchCount)}
          {omen.lastMatchAt ? ` · ${timeAgo(omen.lastMatchAt)}` : ""}
          {omen.strict ? ` · ${copy.strictTag}` : ""}
          {omen.muted ? ` · ${copy.muted}` : ""}
        </p>
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={omen.muted ? copy.unmute : copy.mute}
        title={omen.muted ? copy.unmute : copy.mute}
        onClick={() => void update({ omenId: omen._id, muted: !omen.muted })}
      >
        {omen.muted ? <Bell aria-hidden strokeWidth={1.75} /> : <BellOff aria-hidden strokeWidth={1.75} />}
      </Button>
      <Button
        variant="destructive"
        size="icon-sm"
        aria-label={copy.remove}
        title={copy.remove}
        onClick={async () => {
          if (await confirm({ title: copy.removeTitle, body: copy.removeConfirm(omen.topic), confirmLabel: copy.remove, tone: "danger" })) {
            await remove({ omenId: omen._id });
          }
        }}
      >
        <Trash2 aria-hidden strokeWidth={1.75} />
      </Button>
    </li>
  );
}

/** Opt-in: asks the browser for permission; OmenNotifier (in the nav) does the notifying. */
const noSubscribe = () => () => {};

function NotifyToggle() {
  // The server render knows nothing about the browser, so it says "unsupported" and the client corrects it.
  const current = useSyncExternalStore(
    noSubscribe,
    (): NotificationPermission | "unsupported" => ("Notification" in window ? Notification.permission : "unsupported"),
    () => "unsupported" as const,
  );
  const [asked, setState] = useState<NotificationPermission | null>(null);
  const state = asked ?? current;
  if (state === "unsupported") return null;
  if (state === "granted") return <p className="text-meta text-subtle">{copy.notifyOn}</p>;
  if (state === "denied") return <p className="text-meta text-subtle">{copy.notifyBlocked}</p>;
  return (
    <Button variant="secondary" size="sm" className="self-start" onClick={() => void Notification.requestPermission().then(setState)}>
      <Bell aria-hidden strokeWidth={1.75} /> {copy.notify}
    </Button>
  );
}

/** Shows a browser notification for each new match while Necro is open (only if the user allowed it). */
export function OmenNotifier() {
  const matches = useQuery(api.omens.matches, {});
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!matches) return;
    const ids = new Set(matches.map((m) => m._id as string));
    if (seen.current === null) {
      seen.current = ids; // the first load is history, not news
      return;
    }
    const canNotify = "Notification" in window && Notification.permission === "granted";
    for (const m of matches) {
      if (seen.current.has(m._id) || m.seen) continue;
      if (canNotify) {
        const n = copy.notification(m.topic, m.title);
        new Notification(n.title, { body: n.body, tag: m._id, icon: "/icon.png" });
      }
    }
    seen.current = ids;
  }, [matches]);
  return null;
}
