"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Brain, RotateCcw } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { TOPIC_LABELS } from "@backend/lib/topics";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { useConfirm } from "@/components/ui/confirm";
import { timeAgo } from "@/components/crypt/ItemList";
import { learning as copy } from "@/lib/copy";

/** What Necro has learned from your activity, exactly as the AI sees it, with off and reset. Live. */
export function LearningCard() {
  const data = useQuery(api.learning.mine, {});
  const setEnabled = useMutation(api.learning.setEnabled);
  const reset = useMutation(api.learning.reset);
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState(false);
  if (!data) return <div aria-busy className="h-56 animate-pulse rounded-xl bg-surface-muted/60" />;
  const l = data.learned;
  const thin = !l || l.signals < 3;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-h3 font-bold">
            <Brain aria-hidden className="size-5 text-ecto-ink" strokeWidth={1.75} />
            {copy.title}
          </h2>
          <p className="text-meta text-subtle">{copy.subtitle}</p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-meta font-semibold text-ink">
          <input type="checkbox" className="size-4 accent-[var(--color-ecto-dim)]" checked={data.enabled} disabled={busy} onChange={(e) => void run(() => setEnabled({ enabled: e.target.checked }))} />
          {data.enabled ? copy.on : copy.off}
        </label>
      </div>

      <p className="text-meta text-copy">{copy.how}</p>

      {!data.enabled ? (
        <p className="rounded-lg bg-surface-muted/60 px-4 py-3 text-meta text-subtle">{copy.offBody}</p>
      ) : thin ? (
        <p className="rounded-lg bg-surface-muted/60 px-4 py-3 text-meta text-subtle">{copy.thin(l?.signals ?? 0)}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {l.topics.length ? (
            <div>
              <p className="text-overline font-bold text-subtle uppercase">{copy.topics}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {l.topics.map((t) => (
                  <li key={t.topic} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-meta">
                    <span className="font-semibold text-ink">{TOPIC_LABELS[t.topic]}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <span className="block h-full rounded-full bg-ecto-dim" style={{ width: `${t.share}%` }} />
                    </span>
                    <span className="text-right text-subtle">{t.share}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {l.terms.length ? (
            <div>
              <p className="text-overline font-bold text-subtle uppercase">{copy.terms}</p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {l.terms.map((w) => (
                  <span key={w} className="rounded-full bg-violet-haze/70 px-2 py-0.5 text-[0.75rem] font-semibold text-ink">
                    {w}
                  </span>
                ))}
              </p>
            </div>
          ) : null}
          {l.feeds.length ? (
            <p className="text-meta text-copy">
              <span className="font-semibold text-ink">{copy.feeds}:</span> {l.feeds.join(" · ")}
            </p>
          ) : null}
          {data.promptLine ? (
            <details className="text-meta">
              <summary className="cursor-pointer font-semibold text-ink">{copy.asAiSees}</summary>
              <p className="mt-2 rounded-lg bg-surface-muted/60 px-3 py-2 font-mono text-[0.75rem] text-copy">{data.promptLine}</p>
            </details>
          ) : null}
          <p className="text-[0.75rem] text-subtle">{copy.basedOn(l.signals, timeAgo(l.updatedAt))}</p>
        </div>
      )}

      {data.enabled && l ? (
        <div>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              if (await confirm({ title: copy.resetTitle, body: copy.resetBody, confirmLabel: copy.reset, tone: "danger" })) await run(() => reset({}));
            }}
          >
            <RotateCcw aria-hidden /> {copy.reset}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
