"use client";

import type { FunctionReturnType } from "convex/server";
import { Star } from "lucide-react";
import type { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { crypt as copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

export type ItemCard = FunctionReturnType<typeof api.items.search>[number];

export function timeAgo(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  if (s < 30 * 86_400) return `${Math.round(s / 86_400)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined) return null;
  const tone = score >= 75 ? "bg-ecto/25 text-ecto-ink" : score >= 40 ? "bg-highlight/20 text-copy" : "bg-surface-muted text-subtle";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-overline font-bold", tone)} title="Relevance">
      {score}
    </span>
  );
}

export function ItemList({
  items,
  loading,
  selected,
  onSelect,
}: {
  items: ItemCard[] | undefined;
  loading: boolean;
  selected?: Id<"items">;
  onSelect: (id: Id<"items">) => void;
}) {
  if (loading || !items) {
    return (
      <ul aria-busy className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="h-20 animate-pulse rounded-lg border border-line bg-surface-muted/50" />
        ))}
      </ul>
    );
  }
  if (!items.length) return <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-meta text-subtle">{copy.empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i._id}>
          <button
            onClick={() => onSelect(i._id)}
            aria-current={selected === i._id ? "true" : undefined}
            className={cn(
              "w-full rounded-lg border px-4 py-3 text-left transition-colors",
              selected === i._id ? "border-ecto-dim bg-ecto/10" : "border-line bg-surface hover:bg-surface-muted",
            )}
          >
            <div className="flex items-start gap-2">
              {!i.isRead ? <span aria-label="Unread" className="mt-2 size-2 shrink-0 rounded-full bg-ecto-dim" /> : null}
              <span className={cn("line-clamp-2 flex-1 font-semibold", i.isRead ? "text-copy" : "text-ink")}>{i.title}</span>
              {i.isStarred ? <Star aria-label="Starred" className="size-4 shrink-0 fill-highlight text-highlight" /> : null}
            </div>
            <div className="mt-1 flex items-center gap-2 text-meta text-subtle">
              <span className="truncate">{i.graveTitle}</span>
              <span aria-hidden>·</span>
              <span className="shrink-0">{timeAgo(i.publishedAt)}</span>
              <span className="ml-auto">
                <ScoreBadge score={i.score} />
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
