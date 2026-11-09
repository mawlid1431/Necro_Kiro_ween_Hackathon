"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { Tabs } from "radix-ui";
import { Copy, ExternalLink, Sparkles } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice, Textarea } from "@/components/ui/field";
import { resurrect as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Platform = "linkedin" | "x" | "instagram";
type Draft = { _id: Id<"drafts">; platform: Platform; text: string; hashtags: string[]; status: string; ghost: boolean };

const LIMITS: Record<Platform, number> = { linkedin: 1300, x: 280, instagram: 2200 };
const ORDER: Platform[] = ["linkedin", "x", "instagram"];

/** Open the platform's own composer with the text filled in (no posting APIs). */
function shareUrl(p: Platform, text: string): string {
  if (p === "x") return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
  if (p === "linkedin") return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
  return "https://www.instagram.com/"; // Instagram has no web composer: copy, then paste in the app
}

export function ResurrectDialog({
  open,
  onOpenChange,
  itemId,
  drafts,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  itemId: Id<"items">;
  drafts: Draft[];
  link?: string;
}) {
  const raise = useAction(api.aiNode.raiseResurrect);
  const update = useMutation(api.drafts.update);
  const setStatus = useMutation(api.drafts.setStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);

  // Raise automatically the first time the dialog opens for an item without drafts.
  useEffect(() => {
    if (open && drafts.length === 0 && !busy && !error) void doRaise();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on open only
  }, [open]);

  async function doRaise() {
    setBusy(true);
    setError(null);
    try {
      await raise({ itemId });
      setEdits({});
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const byPlatform = new Map(drafts.map((d) => [d.platform, d]));
  const full = (d: Draft, text: string) => (d.hashtags.length ? `${text}\n\n${d.hashtags.join(" ")}` : text);

  async function save(d: Draft) {
    const text = edits[d._id];
    if (text === undefined) return;
    try {
      await update({ draftId: d._id, text, hashtags: d.hashtags });
      setFlash(`${d._id}:saved`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function copyDraft(d: Draft) {
    const text = full(d, edits[d._id] ?? d.text);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Some browsers and embedded views block clipboard access: say so instead of failing silently.
      setError("Your browser blocked copying. Select the text in the box and copy it by hand.");
      return;
    }
    setFlash(`${d._id}:copied`);
    void setStatus({ draftId: d._id, status: "copied" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={copy.title} description={copy.body} className="max-w-2xl">
      {busy && drafts.length === 0 ? (
        <p role="status" className="flex items-center gap-2 py-10 text-meta text-subtle">
          <Sparkles aria-hidden className="size-4 animate-pulse text-ecto-ink" /> {copy.working}
        </p>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {drafts.length ? (
        <Tabs.Root defaultValue="linkedin">
          <Tabs.List aria-label="Platform" className="mb-4 flex gap-1 border-b border-line">
            {ORDER.map((p) => (
              <Tabs.Trigger
                key={p}
                value={p}
                className="-mb-px border-b-2 border-transparent px-3 py-2 text-meta font-semibold text-subtle data-[state=active]:border-ecto-dim data-[state=active]:text-ink"
              >
                {copy.platforms[p]}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {ORDER.map((p) => {
            const d = byPlatform.get(p);
            if (!d) return null;
            const text = edits[d._id] ?? d.text;
            const over = text.length > LIMITS[p];
            return (
              <Tabs.Content key={p} value={p} className="flex flex-col gap-3">
                {d.ghost ? <Notice>{copy.template}: {copy.templateHint}</Notice> : null}
                <Textarea
                  aria-label={`${copy.platforms[p]} draft`}
                  value={text}
                  onChange={(e) => setEdits((s) => ({ ...s, [d._id]: e.target.value }))}
                  className="min-h-48"
                />
                <div className="flex flex-wrap items-center gap-2 text-meta">
                  <span className={cn("font-semibold", over ? "text-danger" : "text-subtle")}>
                    {text.length} / {LIMITS[p]}
                  </span>
                  {d.hashtags.length ? <span className="truncate text-ecto-ink">{d.hashtags.join(" ")}</span> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void copyDraft(d)} disabled={over}>
                    <Copy aria-hidden strokeWidth={1.75} />
                    {flash === `${d._id}:copied` ? copy.copied : copy.copy}
                  </Button>
                  <Button asChild variant="secondary" size="sm">
                    <a
                      href={shareUrl(p, full(d, text))}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void setStatus({ draftId: d._id, status: "shared" })}
                    >
                      <ExternalLink aria-hidden strokeWidth={1.75} />
                      {copy.openIn(copy.platforms[p])}
                    </a>
                  </Button>
                  {edits[d._id] !== undefined && edits[d._id] !== d.text ? (
                    <Button variant="ghost" size="sm" onClick={() => void save(d)} disabled={over}>
                      {flash === `${d._id}:saved` ? copy.saved : copy.save}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void doRaise()} disabled={busy}>
                    {busy ? copy.working : copy.again}
                  </Button>
                </div>
              </Tabs.Content>
            );
          })}
        </Tabs.Root>
      ) : null}
    </Dialog>
  );
}
