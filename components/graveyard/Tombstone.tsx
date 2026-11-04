"use client";

import { motion, useReducedMotion } from "motion/react";
import { Rss } from "lucide-react";
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
      <span className="grid size-10 place-items-center overflow-hidden rounded-full bg-surface-muted">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote feed favicons from arbitrary hosts
          <img src={iconUrl} alt="" referrerPolicy="no-referrer" className="size-6" />
        ) : (
          <Rss aria-hidden className="size-5 text-subtle" strokeWidth={1.75} />
        )}
      </span>
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
