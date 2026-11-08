"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { motion, useReducedMotion } from "motion/react";
import { Ghost, Sparkles } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/field";
import { fadeUp, staggerChildren } from "@/lib/motion";
import { labels, seance as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { ScoreBadge } from "./ItemList";

type Seance = { summary: string[]; score: number; reason: string; model: string; ghost: boolean } | null;

/** Séance: three bullets and a relevance score. Ghost results are labelled, with a retry. */
export function SeanceCard({ itemId, seance }: { itemId: Id<"items">; seance: Seance }) {
  const hold = useAction(api.aiNode.holdSeance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  async function run(retry = false) {
    setBusy(true);
    setError(null);
    try {
      await hold({ itemId, retry }); // the result arrives through the live items.get query
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!seance) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line bg-surface-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-ink">{labels.seance.themed}</p>
          <p className="text-meta text-subtle">Three bullets and how much this matters to you.</p>
        </div>
        <Button onClick={() => run()} disabled={busy}>
          <Sparkles aria-hidden strokeWidth={1.75} />
          {busy ? copy.holding : copy.hold}
        </Button>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    );
  }

  return (
    <section aria-label={labels.seance.themed} className="rounded-xl border border-line bg-surface-muted/50 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold text-ink">
          {seance.ghost ? <Ghost aria-hidden className="size-4 text-subtle" /> : <Sparkles aria-hidden className="size-4 text-ecto-ink" />}
          {seance.ghost ? copy.ghost : labels.seance.themed}
        </p>
        <span className="flex items-center gap-2 text-meta text-subtle">
          {copy.relevance} <ScoreBadge score={seance.score} />
        </span>
      </div>
      <motion.ul
        variants={reduce ? undefined : staggerChildren}
        initial="hidden"
        animate="visible"
        className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-copy marker:text-ecto-dim"
      >
        {seance.summary.map((b, i) => (
          <motion.li key={i} variants={reduce ? undefined : fadeUp}>
            {b}
          </motion.li>
        ))}
      </motion.ul>
      <p className="mt-3 text-meta text-subtle" title={seance.model}>
        {seance.reason}
      </p>
      {seance.ghost ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-meta text-subtle">{copy.ghostHint}</span>
          <Button variant="secondary" size="sm" onClick={() => run(true)} disabled={busy}>
            {busy ? copy.holding : copy.retry}
          </Button>
        </div>
      ) : null}
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
    </section>
  );
}
