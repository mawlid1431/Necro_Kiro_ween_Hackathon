"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ExternalLink, Sparkles, Star } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { crypt as copy, resurrect as rcopy } from "@/lib/copy";
import { timeAgo } from "./ItemList";
import { SeanceCard } from "./SeanceCard";
import { ResurrectDialog } from "./ResurrectDialog";

export function ReadingPane({ itemId }: { itemId: Id<"items"> }) {
  const item = useQuery(api.items.get, { itemId });
  const setRead = useMutation(api.items.setRead);
  const setStarred = useMutation(api.items.setStarred);
  const [resurrectOpen, setResurrectOpen] = useState(false);
  const marked = useRef(false);

  // Opening an article marks it read, once.
  useEffect(() => {
    if (item && !item.isRead && !marked.current) {
      marked.current = true;
      void setRead({ itemId, value: true });
    }
  }, [item, itemId, setRead]);

  if (item === undefined) {
    return <div aria-busy className="h-96 animate-pulse rounded-xl border border-line bg-surface-muted/50" />;
  }

  return (
    <article className="rounded-xl border border-line bg-surface p-5 sm:p-8">
      <p className="text-overline font-bold tracking-[0.12em] text-subtle uppercase">
        {item.graveTitle} · {timeAgo(item.publishedAt)}
        {item.author ? ` · ${item.author}` : ""}
      </p>
      <h2 className="mt-2 font-display text-h2 font-bold sm:text-[1.75rem] sm:leading-9">{item.title}</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void setStarred({ itemId, value: !item.isStarred })} aria-pressed={item.isStarred}>
          <Star aria-hidden className={item.isStarred ? "fill-highlight text-highlight" : ""} strokeWidth={1.75} />
          {item.isStarred ? copy.unstar : copy.star}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void setRead({ itemId, value: false })}>
          {copy.markUnread}
        </Button>
        {item.link ? (
          <Button asChild variant="ghost" size="sm">
            <a href={item.link} target="_blank" rel="noopener noreferrer nofollow">
              <ExternalLink aria-hidden strokeWidth={1.75} />
              {copy.openOriginal}
            </a>
          </Button>
        ) : null}
        <Button size="sm" className="ml-auto" onClick={() => setResurrectOpen(true)}>
          <Sparkles aria-hidden strokeWidth={1.75} />
          {rcopy.open}
        </Button>
      </div>

      <div className="mt-6">
        <SeanceCard itemId={itemId} seance={item.seance} />
      </div>

      {/* contentHtml is sanitised with an allowlist at ingest (backend/lib/sanitize.ts). */}
      <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: item.contentHtml || `<p>${item.excerpt}</p>` }} />

      <ResurrectDialog open={resurrectOpen} onOpenChange={setResurrectOpen} itemId={itemId} drafts={item.drafts} link={item.link} />
    </article>
  );
}
