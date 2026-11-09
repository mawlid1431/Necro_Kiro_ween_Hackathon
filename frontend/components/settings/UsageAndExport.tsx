"use client";

import { useConvex, useQuery } from "convex/react";
import { Download } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/field";
import { settings as copy } from "@/lib/copy";

const NAMES: Record<string, string> = { seance: "Séances", resurrect: "Resurrects", doctor: "Doctor notes", ask: "Questions", omen: "Omen checks", opinion: "Second Opinions", grimoire: "Grimoire drafts", voiceMinutes: "Voice minutes" };

/** Today's AI usage against the daily limits, and an OPML export of every feed. */
export function UsageAndExport() {
  const usage = useQuery(api.usage.today);
  const convex = useConvex();

  async function exportOpml() {
    const xml = await convex.query(api.graves.exportOpml, {});
    const url = URL.createObjectURL(new Blob([xml], { type: "text/x-opml" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "necro-feeds.opml" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card aria-labelledby="usage-h">
      <h2 id="usage-h" className="font-display text-h3 font-bold">{copy.usage}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {usage
          ? Object.entries(usage).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-surface-muted p-3">
                <dt className="text-meta text-subtle">{NAMES[k] ?? k}</dt>
                <dd className="mt-1 font-semibold text-ink">
                  {v.used} <span className="text-meta font-normal text-subtle">/ {v.limit}</span>
                </dd>
              </div>
            ))
          : null}
      </dl>
      <Button variant="secondary" size="sm" className="mt-4" onClick={() => void exportOpml()}>
        <Download aria-hidden strokeWidth={1.75} />
        {copy.export}
      </Button>
    </Card>
  );
}
