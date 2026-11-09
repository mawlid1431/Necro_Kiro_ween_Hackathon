"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Notice, Textarea } from "@/components/ui/field";
import { covens as copy, TOPICS, type Topic } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";

type Existing = { _id: Id<"collections">; title: string; description: string; topic: Topic; visibility: "public" | "unlisted"; starredFeed: boolean; feedUrls: string[] };

/** Publish or edit a collection: pick your feeds, name it, choose who sees it. */
export function PublishDialog({ existing, onClose, onDone }: { existing?: Existing; onClose: () => void; onDone: (slug?: string) => void }) {
  const graves = useQuery(api.graves.list, {});
  const create = useMutation(api.covens.create);
  const update = useMutation(api.covens.update);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [topic, setTopic] = useState<Topic>(existing?.topic ?? "other");
  const [visibility, setVisibility] = useState<"public" | "unlisted">(existing?.visibility ?? "public");
  const [starredFeed, setStarredFeed] = useState(existing?.starredFeed ?? false);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Default selection: the feeds already in the collection (edit) or none (new). Computed once graves load.
  const selected =
    picked ?? new Set((graves ?? []).filter((g) => existing?.feedUrls.includes(g.feedUrl)).map((g) => g._id as string));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const graveIds = [...selected] as Id<"graves">[];
      if (existing) {
        await update({ collectionId: existing._id, title, description, topic, visibility, starredFeed, graveIds });
        onDone();
      } else {
        const r = await create({ title, description, topic, visibility, starredFeed, graveIds });
        onDone(r.slug);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={existing ? copy.editTitle : copy.publishTitle} description={copy.publishBody} className="max-w-xl">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="cv-title">{copy.title}</Label>
          <Input id="cv-title" required minLength={3} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Security daily" />
        </div>
        <div>
          <Label htmlFor="cv-desc">{copy.description}</Label>
          <Textarea id="cv-desc" maxLength={280} className="min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="cv-topic">{copy.topic}</Label>
            <select id="cv-topic" value={topic} onChange={(e) => setTopic(e.target.value as Topic)} className="h-10 w-full rounded-md border-[1.5px] border-line bg-surface px-3 text-body text-ink">
              {(Object.keys(TOPICS) as Topic[]).map((t) => (
                <option key={t} value={t}>{TOPICS[t]}</option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-meta font-semibold text-ink">{copy.visibility}</legend>
            {(["public", "unlisted"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 text-meta text-copy">
                <input type="radio" name="cv-vis" checked={visibility === v} onChange={() => setVisibility(v)} className="accent-ecto-dim" />
                {copy[v]}
              </label>
            ))}
          </fieldset>
        </div>
        <label className="flex items-center gap-2 text-meta text-copy">
          <input type="checkbox" checked={starredFeed} onChange={(e) => setStarredFeed(e.target.checked)} className="accent-ecto-dim" />
          {copy.starred}
        </label>

        <fieldset>
          <legend className="mb-1.5 text-meta font-semibold text-ink">{copy.pickFeeds(selected.size)}</legend>
          {graves === undefined ? <div className="h-24 animate-pulse rounded-lg bg-surface-muted/60" /> : null}
          {graves && !graves.length ? <Notice>{copy.noFeeds}</Notice> : null}
          {graves && graves.length ? (
            <ul className="flex max-h-56 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {graves.map((g) => (
                <li key={g._id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-muted">
                    <input type="checkbox" checked={selected.has(g._id)} onChange={() => toggle(g._id)} className="accent-ecto-dim" />
                    <span className="truncate text-copy">{g.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>

        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button type="submit" disabled={busy || selected.size === 0 || title.trim().length < 3} className="self-start">
          {existing ? copy.saveEdit : copy.save}
        </Button>
      </form>
    </Dialog>
  );
}
