"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Check, Download, Flag, Link2, Rss, Sparkles } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/field";
import { covens as copy, TOPICS } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";

const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";

/** One collection: its feeds (with what you already follow), Summon all, Follow, share, OPML and Report. */
export function CollectionDialog({ slug, onClose, onEdit }: { slug: string; onClose: () => void; onEdit: (slug: string) => void }) {
  const c = useQuery(api.covens.get, { slug });
  const subscribeAll = useAction(api.covensNode.subscribeAll);
  const follow = useMutation(api.covens.follow);
  const unfollow = useMutation(api.covens.unfollow);
  const report = useMutation(api.covens.report);
  const remove = useMutation(api.covens.remove);
  const { confirm, ask } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setNote(null);
    try {
      setNote({ tone: "ok", text: await fn() });
    } catch (e) {
      setNote({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const title = c ? c.title : c === null ? "Not found" : "Loading…";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} description={c ? `${TOPICS[c.topic]} · ${copy.by(c.curator)}` : undefined} className="max-w-xl">
      {c === undefined ? <div aria-busy className="h-48 animate-pulse rounded-lg bg-surface-muted/60" /> : null}
      {c === null ? <Notice tone="error">{copy.notFound}</Notice> : null}
      {c ? (
        <div className="flex flex-col gap-4">
          {c.hidden ? <Notice tone="info">{copy.hiddenNote}</Notice> : null}
          {c.description ? <p className="text-copy">{c.description}</p> : null}
          <p className="text-meta text-subtle">
            {copy.feeds(c.feedCount)} · {copy.followers(c.followerCount)}
          </p>

          <ul className="flex max-h-64 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {c.feeds.map((f) => {
              const have = c.alreadyHave.includes(f.feedUrl);
              return (
                <li key={f.feedUrl} className="flex items-center gap-3 px-3 py-2.5">
                  <Rss aria-hidden className="size-4 shrink-0 text-ecto-ink" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{f.title}</p>
                    <p className="truncate text-meta text-subtle">{f.siteUrl ?? f.feedUrl}</p>
                  </div>
                  {have ? (
                    <span className="flex shrink-0 items-center gap-1 text-meta font-semibold text-ecto-ink">
                      <Check aria-hidden className="size-4" /> {copy.have}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

          <div className="flex flex-wrap gap-2">
            {!c.isOwner ? (
              <>
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await subscribeAll({ slug });
                      return copy.summoned(r.created, r.duplicates);
                    })
                  }
                >
                  <Sparkles aria-hidden strokeWidth={1.75} />
                  {busy ? copy.summoning : copy.summonAll}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  aria-pressed={c.following}
                  onClick={() => run(async () => (c.following ? (await unfollow({ collectionId: c._id }), copy.unfollow) : (await follow({ collectionId: c._id }), copy.following)))}
                >
                  {c.following ? copy.following : copy.follow}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={() => onEdit(slug)}>{copy.edit}</Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (await confirm({ title: copy.deleteTitle, body: copy.deleteConfirm(c.title), confirmLabel: copy.delete, tone: "danger" })) {
                      await remove({ collectionId: c._id });
                      onClose();
                    }
                  }}
                >
                  {copy.delete}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              onClick={() =>
                run(async () => {
                  await navigator.clipboard.writeText(`${window.location.origin}/discover?c=${slug}`);
                  return copy.copied;
                })
              }
            >
              <Link2 aria-hidden strokeWidth={1.75} /> {copy.copyLink}
            </Button>
            {siteUrl ? (
              <Button asChild variant="ghost">
                <a href={`${siteUrl}/c/${slug}.opml`} download>
                  <Download aria-hidden strokeWidth={1.75} /> {copy.opml}
                </a>
              </Button>
            ) : null}
            {!c.isOwner ? (
              <Button
                variant="ghost"
                className="ml-auto text-subtle"
                onClick={async () => {
                  const reason = await ask({ title: copy.reportTitle, label: copy.reportPrompt, placeholder: copy.reportPlaceholder, confirmLabel: copy.reportSend, tone: "danger" });
                  if (reason !== null) await run(async () => (await report({ collectionId: c._id, reason: reason || "No reason given" }), copy.reported));
                }}
              >
                <Flag aria-hidden strokeWidth={1.75} /> {copy.report}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
