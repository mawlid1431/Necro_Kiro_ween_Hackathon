"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Stethoscope } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Card, Notice } from "@/components/ui/field";
import { timeAgo } from "@/components/crypt/ItemList";
import { doctorCopy as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";

type Row = { tone: "ok" | "error" | "info"; text: string; candidate?: string };

const HEALTH = {
  broken: { label: "Broken", tone: "text-danger" },
  failing: { label: "Failing", tone: "text-highlight" },
  dormant: { label: "Sleeping", tone: "text-subtle" },
} as const;

/** Feed Doctor: broken and sleeping feeds, each with a diagnosis and fixes. */
export function DoctorList() {
  const rows = useQuery(api.doctor.list);
  const retry = useAction(api.doctorNode.retry);
  const tryFix = useAction(api.doctorNode.tryFix);
  const explain = useAction(api.doctorNode.explain);
  const applyFix = useMutation(api.doctor.applyFix);
  const bury = useMutation(api.graves.layToRest);
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, Row>>({});
  // Kept apart from notes so a later Retry or Explain message does not hide "Use this feed".
  const [candidates, setCandidates] = useState<Record<string, string>>({});

  async function act(id: Id<"graves">, what: string, fn: () => Promise<Row>) {
    setBusy(`${id}:${what}`);
    try {
      const row = await fn();
      setNotes((n) => ({ ...n, [id]: row }));
      if (row.candidate) setCandidates((c) => ({ ...c, [id]: row.candidate! }));
      if (what === "fix" && !row.candidate) {
        setCandidates((c) => {
          const next = { ...c };
          delete next[id];
          return next;
        });
      }
    } catch (e) {
      setNotes((n) => ({ ...n, [id]: { tone: "error", text: errorMessage(e) } }));
    } finally {
      setBusy(null);
    }
  }

  if (rows === undefined) return <div aria-busy className="h-40 animate-pulse rounded-xl border border-line bg-surface-muted/50" />;
  if (!rows.length) {
    return (
      <Card className="flex flex-col items-center py-12 text-center">
        <Stethoscope aria-hidden className="size-8 text-ecto-ink" strokeWidth={1.5} />
        <p className="mt-3 text-copy">{copy.empty}</p>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {rows.map((g) => {
        const note = notes[g._id];
        const is = (w: string) => busy === `${g._id}:${w}`;
        return (
          <li key={g._id}>
            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-h3 font-semibold">{g.title}</h2>
                <span className={`text-meta font-semibold ${HEALTH[g.health].tone}`}>{HEALTH[g.health].label}</span>
              </div>
              <p className="mt-1 truncate text-meta text-subtle">{g.feedUrl}</p>
              <p className="mt-3 text-copy">{g.doctorNote ?? g.diagnosis}</p>
              <p className="mt-1 text-meta text-subtle">
                {g.failureCount ? `${g.failureCount} failed checks · ` : ""}
                last checked {g.lastFetchedAt ? timeAgo(g.lastFetchedAt) : "never"}
              </p>
              {note ? <div className="mt-3"><Notice tone={note.tone}>{note.text}</Notice></div> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!!busy}
                  onClick={() =>
                    act(g._id, "retry", async () => {
                      const r = await retry({ graveId: g._id });
                      return r.diagnosis ? { tone: "error", text: r.diagnosis } : { tone: "ok", text: `Alive again. ${r.inserted} new posts.` };
                    })
                  }
                >
                  {is("retry") ? "Checking…" : copy.retry}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!!busy}
                  onClick={() =>
                    act(g._id, "fix", async () => {
                      const r = await tryFix({ graveId: g._id });
                      return r ? { tone: "info", text: copy.found(r.title, r.itemCount), candidate: r.candidateUrl } : { tone: "error", text: copy.noFix };
                    })
                  }
                >
                  {is("fix") ? "Searching…" : copy.tryFix}
                </Button>
                {candidates[g._id] ? (
                  <Button
                    size="sm"
                    disabled={!!busy}
                    onClick={() =>
                      act(g._id, "apply", async () => {
                        await applyFix({ graveId: g._id, candidateUrl: candidates[g._id] });
                        return { tone: "ok", text: "Fixed. Necro is fetching the new address now." };
                      })
                    }
                  >
                    {copy.apply}
                  </Button>
                ) : null}
                {g.lastErrorCode && !g.doctorNote ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!!busy}
                    onClick={() => act(g._id, "explain", async () => ({ tone: "info", text: (await explain({ graveId: g._id })).note }))}
                  >
                    {copy.explain}
                  </Button>
                ) : null}
                <Button size="sm" variant="destructive" className="ml-auto" disabled={!!busy} onClick={async () => {
                    if (await confirm({ title: copy.buryTitle, body: copy.buryBody(g.title), confirmLabel: copy.bury, tone: "danger" })) await bury({ graveId: g._id });
                  }}>
                  {copy.bury}
                </Button>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
