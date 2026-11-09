"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Scale } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/field";
import { opinion as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";

/** Second Opinion: how the sources of one Kindred group agree, differ, or stand alone. */
export function SecondOpinion({ itemId, onOpen }: { itemId: Id<"items">; onOpen?: (id: Id<"items">) => void }) {
  const cached = useQuery(api.opinions.forItem, { itemId });
  const compare = useAction(api.opinionNode.compare);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(retry = false) {
    setBusy(true);
    setError(null);
    try {
      await compare({ itemId, retry }); // the result arrives through the forItem query
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (cached === undefined) return null;
  if (!cached) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <Button variant="secondary" size="sm" className="self-start" disabled={busy} onClick={() => void run()}>
          <Scale aria-hidden strokeWidth={1.75} />
          {busy ? copy.working : copy.open}
        </Button>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    );
  }

  const feedOf = new Map(cached.sources.map((s) => [s.label, s.feed]));
  const Chips = ({ labels }: { labels: string[] }) => (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {labels.map((l) => (
        <span key={l} className="rounded-full bg-surface-muted px-2 py-px text-[0.6875rem] font-semibold text-subtle">
          {feedOf.get(l) ?? l}
        </span>
      ))}
    </span>
  );

  return (
    <section aria-labelledby="opinion-h" className="mt-4 rounded-lg border border-line p-4">
      <h3 id="opinion-h" className="flex items-baseline gap-2">
        <span className="font-display text-h3 font-bold">{copy.label}</span>
        <span className="text-meta text-subtle">{copy.plain}</span>
      </h3>

      {cached.ghost ? (
        <>
          <p className="mt-2 text-meta text-subtle">{copy.ghostHint}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {cached.sources.map((s) => (
              <div key={s.label} className="rounded-lg bg-surface-muted/60 p-3">
                <button onClick={() => onOpen?.(s.itemId)} className="text-left text-meta font-semibold text-ink hover:underline">
                  {s.feed}
                </button>
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-meta text-copy">
                  {s.key.map((k) => <li key={k}>{k}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="mt-3" disabled={busy} onClick={() => void run(true)}>
            {busy ? copy.working : copy.retry}
          </Button>
        </>
      ) : (
        <div className="mt-3 flex flex-col gap-4 text-copy">
          {cached.agree.length ? (
            <div>
              <h4 className="text-overline font-bold tracking-[0.12em] text-ecto-ink uppercase">{copy.agree}</h4>
              <ul className="mt-1 flex flex-col gap-1.5">
                {cached.agree.map((a) => (
                  <li key={a.point}>{a.point}<Chips labels={a.sources} /></li>
                ))}
              </ul>
            </div>
          ) : null}
          {cached.differ.length ? (
            <div>
              <h4 className="text-overline font-bold tracking-[0.12em] text-highlight uppercase">{copy.differ}</h4>
              <ul className="mt-1 flex flex-col gap-2">
                {cached.differ.map((d) => (
                  <li key={d.point}>
                    <p className="font-semibold text-ink">{d.point}</p>
                    <ul className="mt-0.5 flex flex-col gap-0.5 text-meta">
                      {d.views.map((v) => (
                        <li key={v.source}><span className="font-semibold">{feedOf.get(v.source) ?? v.source}:</span> {v.says}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {cached.onlyOne.length ? (
            <div>
              <h4 className="text-overline font-bold tracking-[0.12em] text-subtle uppercase">{copy.onlyOne}</h4>
              <ul className="mt-1 flex flex-col gap-1.5">
                {cached.onlyOne.map((o) => (
                  <li key={o.claim}>{o.claim}<Chips labels={[o.source]} /></li>
                ))}
              </ul>
            </div>
          ) : null}
          {!cached.agree.length && !cached.differ.length && !cached.onlyOne.length ? <p className="text-meta text-subtle">{copy.nothing}</p> : null}
          <p className="text-[0.6875rem] text-subtle">{copy.caveat}</p>
        </div>
      )}
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
    </section>
  );
}
