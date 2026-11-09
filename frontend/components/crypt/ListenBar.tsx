"use client";

import { Pause, Play, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { voice as copy } from "@/lib/copy";
import type { SpeakProgress } from "@/lib/voice";
import { cn } from "@/lib/utils";

/** Equaliser bars: moving while audio plays, still when paused or with reduced motion. */
export function Bars({ active, className }: { active: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("flex h-5 items-end gap-[3px]", className)}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn("w-[3px] rounded-full bg-ecto-dim", active ? "animate-eq motion-reduce:animate-none" : "")}
          style={{ height: active ? undefined : `${[40, 70, 55, 30][i]}%`, animationDelay: `${i * 140}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Listen mini player: what is being read, the sentence being spoken now, progress,
 * Pause / Resume and Stop. Sticks to the bottom of the article while you scroll.
 */
export function ListenBar({ title, progress, paused, onPause, onStop }: { title: string; progress: SpeakProgress | null; paused: boolean; onPause: () => void; onStop: () => void }) {
  const pct = progress ? Math.round(((progress.index + 1) / progress.total) * 100) : 0;
  return (
    <div role="region" aria-label={copy.listen} className="sticky bottom-20 z-30 mt-6 md:bottom-6">
      <div className="overflow-hidden rounded-xl border border-ecto-dim/60 bg-surface/95 shadow-glow backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ecto/30">
            {progress ? <Bars active={!paused} /> : <Volume2 aria-hidden className="size-5 text-ecto-ink" strokeWidth={1.75} />}
          </span>
          <div className="min-w-0 flex-1" aria-live="polite">
            <p className="flex items-center gap-2 text-overline font-bold tracking-[0.12em] text-ecto-ink uppercase">
              {paused ? copy.paused : copy.readingLabel(progress?.label ?? "Article")}
              {progress ? <span className="font-semibold tracking-normal text-subtle normal-case">· {copy.progress(progress.index + 1, progress.total)}</span> : null}
            </p>
            <p className="truncate text-meta font-semibold text-ink">{title}</p>
            <p className="line-clamp-1 text-meta text-copy italic">{progress?.text ?? "…"}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onPause} aria-label={paused ? copy.resume : copy.pause}>
            {paused ? <Play aria-hidden strokeWidth={1.75} /> : <Pause aria-hidden strokeWidth={1.75} />}
            <span className="hidden sm:inline">{paused ? copy.resume : copy.pause}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onStop} aria-label={copy.stop}>
            <Square aria-hidden strokeWidth={1.75} />
            <span className="hidden sm:inline">{copy.stop}</span>
          </Button>
        </div>
        <div className="h-1 bg-surface-muted">
          <div className="h-full bg-ecto-dim transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
