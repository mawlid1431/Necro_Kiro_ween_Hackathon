"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { BookOpen, Copy, Trash2 } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Card, Label, Notice, Textarea } from "@/components/ui/field";
import { grimoire as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** Grimoire: compose the week's newsletter, edit it, copy it; past drafts below. */
export function Grimoire() {
  const list = useQuery(api.grimoires.list, {});
  const compose = useAction(api.grimoireNode.compose);
  const [picked, setPicked] = useState<Id<"grimoires"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openId = picked ?? list?.[0]?._id ?? null; // newest by default

  async function onCompose() {
    setBusy(true);
    setError(null);
    try {
      const r = await compose({});
      setPicked(r.grimoireId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="max-w-2xl text-copy">{copy.intro}</p>
        <p className="text-meta text-subtle">
          <Link href="/settings" className="underline-offset-4 hover:text-ink hover:underline">
            {copy.voiceHint}
          </Link>
        </p>
        <Button className="self-start" disabled={busy} onClick={() => void onCompose()}>
          <BookOpen aria-hidden strokeWidth={1.75} />
          {busy ? copy.composing : copy.compose}
        </Button>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        <div className="min-w-0">{openId ? <Editor key={openId} grimoireId={openId} onDeleted={() => setPicked(null)} /> : null}</div>

        <section aria-labelledby="history-h" className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <h2 id="history-h" className="font-display text-h3 font-bold">
            {copy.history}
          </h2>
          {list === undefined ? <div className="h-16 animate-pulse rounded-xl bg-surface-muted/60" /> : null}
          {list && !list.length ? <Notice>{copy.none}</Notice> : null}
          {list && list.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
              {list.map((g) => (
                <li key={g._id}>
                  <button
                    onClick={() => setPicked(g._id)}
                    aria-current={openId === g._id ? "true" : undefined}
                    className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted", openId === g._id && "bg-ecto/10")}
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{g.title}</span>
                    <span className="shrink-0 text-meta text-subtle lg:hidden">
                      {g.weekOf} · {copy.items(g.itemCount)}
                      {g.ghost ? ` · ${copy.template}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Editor({ grimoireId, onDeleted }: { grimoireId: Id<"grimoires">; onDeleted: () => void }) {
  const g = useQuery(api.grimoires.get, { grimoireId });
  if (!g) return <div aria-busy className="h-80 animate-pulse rounded-xl bg-surface-muted/60" />;
  return <EditorForm key={g.updatedAt} grimoire={g} onDeleted={onDeleted} />;
}

function EditorForm({ grimoire, onDeleted }: { grimoire: { _id: Id<"grimoires">; markdown: string; ghost: boolean }; onDeleted: () => void }) {
  const update = useMutation(api.grimoires.update);
  const remove = useMutation(api.grimoires.remove);
  const { confirm } = useConfirm();
  const [text, setText] = useState(grimoire.markdown);
  const [note, setNote] = useState<string | null>(null);
  const dirty = text !== grimoire.markdown;

  async function copyAs(kind: "md" | "text") {
    await navigator.clipboard.writeText(kind === "md" ? text : markdownToText(text));
    setNote(copy.copied);
  }

  return (
    <Card>
      {grimoire.ghost ? <Notice>{copy.ghostHint}</Notice> : null}
      <div className={grimoire.ghost ? "mt-4" : ""}>
        <Label htmlFor="grimoire-md">{copy.editLabel}</Label>
        <Textarea
          id="grimoire-md"
          value={text}
          maxLength={20000}
          onChange={(e) => {
            setText(e.target.value);
            setNote(null);
          }}
          className="min-h-96 font-mono text-meta leading-6"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          disabled={!dirty}
          onClick={() =>
            void update({ grimoireId: grimoire._id, markdown: text })
              .then(() => setNote(copy.saved))
              .catch((e: unknown) => setNote(errorMessage(e)))
          }
        >
          {copy.save}
        </Button>
        <Button variant="secondary" onClick={() => void copyAs("md")}>
          <Copy aria-hidden strokeWidth={1.75} /> {copy.copyMarkdown}
        </Button>
        <Button variant="secondary" onClick={() => void copyAs("text")}>
          <Copy aria-hidden strokeWidth={1.75} /> {copy.copyText}
        </Button>
        {note ? (
          <span role="status" className="text-meta text-subtle">
            {note}
          </span>
        ) : null}
        <Button
          variant="destructive"
          size="sm"
          className="ml-auto"
          onClick={async () => {
            if (await confirm({ title: copy.deleteConfirm, body: copy.deleteBody, confirmLabel: copy.delete, tone: "danger" })) {
              await remove({ grimoireId: grimoire._id });
              onDeleted();
            }
          }}
        >
          <Trash2 aria-hidden strokeWidth={1.75} /> {copy.delete}
        </Button>
      </div>
    </Card>
  );
}

function safeDecode(u: string): string {
  try {
    return decodeURI(u);
  } catch {
    return u; // a hand-edited link with a stray "%" stays as typed
  }
}

/** Plain text for LinkedIn and email: keeps links as "title (url)", drops Markdown marks. */
function markdownToText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t: string, u: string) => `${t.replace(/\\([[\]\\])/g, "$1")} (${safeDecode(u)})`)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\*(.+)\*$/gm, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^- /gm, "• ")
    .trim();
}
