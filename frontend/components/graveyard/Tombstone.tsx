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
 * The feed's mark on the stone: its icon when it loads at a usable size, else an engraved initial.
 * Broken, empty (0-byte favicon.ico) or tiny icons fall back instead of showing a broken image.
 */
function FeedMark({ title, iconUrl }: { title: string; iconUrl?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "small" | "failed">(iconUrl ? "loading" : "failed");
  const initial = (title.match(/[\p{L}\p{N}]/u)?.[0] ?? "N").toUpperCase();
  const showIcon = iconUrl && state !== "failed";
  return (
    <span className="relative grid size-16 place-items-center overflow-hidden rounded-full border border-line bg-surface-muted shadow-[inset_0_2px_6px_rgb(0_0_0/0.08)]">
      {showIcon ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote feed icons from arbitrary hosts
        <img
          src={iconUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={(e) => {
            const w = e.currentTarget.naturalWidth;
            setState(w === 0 ? "failed" : w < 48 ? "small" : "ok");
          }}
          onError={() => setState("failed")}
          className={cn("object-contain transition-opacity", state === "ok" ? "size-11 rounded-lg" : "size-7", state === "loading" ? "opacity-0" : "opacity-100")}
        />
      ) : (
        <span aria-hidden className="font-display text-[1.75rem] leading-none font-bold text-copy [text-shadow:0_1px_0_rgb(255_255_255/0.8)]">
          {initial}
        </span>
      )}
    </span>
  );
}
