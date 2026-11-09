"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { rise } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type GraveStatus = "alive" | "dormant" | "broken";

const statusText: Record<GraveStatus, string> = {
  alive: "Alive",
  dormant: "Sleeping",
  broken: "Broken",
};

const statusColor: Record<GraveStatus, string> = {
  alive: "text-ecto-ink",
  dormant: "text-subtle",
  broken: "text-danger",
};

type TombstoneProps = {
  title: string;
  iconUrl?: string;
  status: GraveStatus;
  unread: number;
  /** True when new items just arrived: lifts and glows once. */
  risen?: boolean;
};

/** A feed shown as an arched tombstone card (brand guide section 5). */
export function Tombstone({ title, iconUrl, status, unread, risen }: TombstoneProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.article
      variants={reduceMotion ? undefined : rise}
      initial="rest"
      animate={risen ? "risen" : "rest"}
      className="flex aspect-[4/5] flex-col items-center justify-end gap-3 rounded-tomb border border-line bg-surface px-4 pt-10 pb-5 text-center"
    >
      <FeedMark title={title} iconUrl={iconUrl} />
      <h3 className="line-clamp-2 text-h3 font-semibold">{title}</h3>
      <div className="flex items-center gap-2 text-meta font-medium">
        <span className={statusColor[status]}>{statusText[status]}</span>
        {unread > 0 && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-overline font-bold",
              risen ? "bg-highlight text-ink" : "bg-surface-muted text-copy",
            )}
          >
            {unread}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </div>
    </motion.article>
  );
}

/**
 * The feed's mark on the stone: an engraved initial (always legible, on brand), with the site's
 * icon as a small badge when it loads. Broken, empty (0-byte favicon.ico) or blocked icons just disappear.
 */
function FeedMark({ title, iconUrl }: { title: string; iconUrl?: string }) {
  const [ok, setOk] = useState<boolean | null>(iconUrl ? null : false);
  const initial = (title.match(/[\p{L}\p{N}]/u)?.[0] ?? "N").toUpperCase();
  return (
    <span className="relative">
      <span className="grid size-16 place-items-center rounded-full border border-line bg-surface-muted shadow-[inset_0_2px_6px_rgb(0_0_0/0.08)]">
        <span aria-hidden className="font-display text-[1.875rem] leading-none font-bold text-copy [text-shadow:0_1px_0_rgb(255_255_255/0.9)]">
          {initial}
        </span>
      </span>
      {iconUrl && ok !== false ? (
        <span className={cn("absolute -right-1.5 -bottom-1.5 grid size-8 place-items-center overflow-hidden rounded-full border-2 border-surface bg-white shadow-sm transition-opacity", ok ? "opacity-100" : "opacity-0")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- remote feed icons from arbitrary hosts */}
          <img
            src={iconUrl}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            // An image that finished before hydration never fires onLoad: read its state on mount.
            ref={(el) => {
              if (el?.complete && ok === null) setOk(el.naturalWidth > 0);
            }}
            onLoad={(e) => setOk(e.currentTarget.naturalWidth > 0)}
            onError={() => setOk(false)}
            className="size-6 object-contain"
          />
        </span>
      ) : null}
    </span>
  );
}
