"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { CalendarClock, Check } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { SocialPlatform } from "@/lib/post";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/field";
import { witching as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";

/** "YYYY-MM-DDTHH:mm" in the viewer's local time, for <input type="datetime-local">. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Next round hour at least 30 minutes away. */
export function suggestedTime(now = Date.now()): number {
  const d = new Date(now + 30 * 60_000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.getTime();
}

/**
 * Schedule this exact post for later. Connected accounts post on their own at that time; otherwise (and always
 * for TikTok) Witching Hour reminds you, and sharing is one tap.
 */
export function ScheduleControl({ platform, draftId, text, disabled, auto }: { platform: SocialPlatform; draftId: Id<"drafts">; text: string; disabled: boolean; auto: boolean }) {
  const schedule = useMutation(api.social.schedule);
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(suggestedTime()));
  const [minWhen] = useState(() => toLocalInput(Date.now() + 2 * 60_000));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ at: number; mode: "auto" | "reminder" } | null>(null);
  const isAuto = auto && platform !== "tiktok";

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const at = new Date(when).getTime();
      const r = await schedule({ draftId, platform, text, at });
      setDone({ at, mode: r.mode });
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Notice tone="ok">
        <span className="inline-flex flex-wrap items-center gap-2">
          <Check aria-hidden className="size-4" />
          {done.mode === "auto" ? copy.scheduledAuto(new Date(done.at)) : copy.scheduledReminder(new Date(done.at))}
          <Link href="/calendar" className="underline">
            {copy.openCalendar}
          </Link>
        </span>
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-line p-3">
          <label className="flex flex-col gap-1 text-meta font-semibold">
            {copy.when}
            <input
              type="datetime-local"
              value={when}
              min={minWhen}
              onChange={(e) => setWhen(e.target.value)}
              className="rounded-md border border-line bg-surface px-2 py-2 text-body"
            />
          </label>
          <p className="text-meta text-subtle">{isAuto ? copy.autoHint : platform === "tiktok" ? copy.tiktokReminderHint : copy.reminderHint}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void go()} disabled={busy || disabled || !when}>
              <CalendarClock aria-hidden strokeWidth={1.75} /> {busy ? copy.scheduling : isAuto ? copy.schedulePost : copy.scheduleReminder}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)} disabled={disabled}>
          <CalendarClock aria-hidden strokeWidth={1.75} /> {copy.scheduleForLater}
        </Button>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}
