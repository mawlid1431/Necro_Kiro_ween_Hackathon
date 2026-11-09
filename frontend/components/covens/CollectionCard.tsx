"use client";

import type { FunctionReturnType } from "convex/server";
import { Rss, Users } from "lucide-react";
import type { api } from "@backend/convex/_generated/api";
import { covens as copy, TOPICS } from "@/lib/copy";

export type CollectionCardData = FunctionReturnType<typeof api.covens.discover>[number];

/** A collection in Discover: what it is, who curates it, and a peek at its feeds. */
export function CollectionCard({ c, onOpen }: { c: CollectionCardData; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex h-full w-full flex-col rounded-xl border border-line bg-surface p-5 text-left transition-all duration-200 ease-rise hover:-translate-y-0.5 hover:border-ecto-dim hover:shadow-glow focus-visible:outline-2"
    >
      <span className="self-start rounded-full bg-surface-muted px-2.5 py-0.5 text-overline font-bold tracking-[0.12em] text-subtle uppercase">
        {TOPICS[c.topic]}
      </span>
      <h3 className="mt-3 text-h3 font-semibold text-ink">{c.title}</h3>
      <p className="mt-0.5 text-meta text-subtle">{copy.by(c.curator)}</p>
      {c.description ? <p className="mt-2 line-clamp-2 text-meta text-copy">{c.description}</p> : null}
      <ul className="mt-3 flex flex-col gap-1 text-meta text-copy">
        {c.preview.map((t) => (
          <li key={t} className="flex items-center gap-1.5 truncate">
            <Rss aria-hidden className="size-3.5 shrink-0 text-ecto-ink" strokeWidth={1.75} />
            <span className="truncate">{t}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center gap-3 pt-4 text-meta text-subtle">
        <span>{copy.feeds(c.feedCount)}</span>
        <span aria-hidden>·</span>
        <span className="flex items-center gap-1">
          <Users aria-hidden className="size-3.5" strokeWidth={1.75} />
          {copy.followers(c.followerCount)}
        </span>
      </div>
    </button>
  );
}
