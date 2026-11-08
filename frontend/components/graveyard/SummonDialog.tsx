"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction } from "convex/react";
import { Plus, Upload } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Notice } from "@/components/ui/field";
import { labels, summon as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";

type Result = { tone: "ok" | "error" | "info"; text: string } | null;

/** Summon: add a feed by URL (discovery included) or import an OPML file. */
export function SummonDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const summonFeed = useAction(api.feedsNode.summon);
  const importOpml = useAction(api.feedsNode.importOpml);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await summonFeed({ url: url.trim(), folder: folder.trim() || undefined });
      if (r.status === "duplicate") setResult({ tone: "info", text: copy.duplicate });
      else {
        setResult({ tone: "ok", text: copy.summoned(r.title, r.itemCount) });
        setUrl("");
      }
    } catch (err) {
      setResult({ tone: "error", text: errorMessage(err, "That address did not return a feed.") });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      if (file.size > 1024 * 1024) throw new Error("too big");
      const r = await importOpml({ opml: await file.text() });
      setResult({ tone: "ok", text: copy.imported(r.created, r.duplicates, r.skipped) });
    } catch (err) {
      setResult({ tone: "error", text: errorMessage(err, "That file could not be imported. OPML files can be up to 1 MB.") });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Plus aria-hidden strokeWidth={1.75} />
        {labels.summon.themed}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setResult(null);
        }}
        title={copy.title}
        description={copy.body}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="summon-url">{copy.urlLabel}</Label>
            <Input
              id="summon-url"
              type="text"
              inputMode="url"
              autoComplete="url"
              autoFocus
              required
              maxLength={2000}
              placeholder={copy.urlPlaceholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="summon-folder">{copy.folderLabel}</Label>
            <Input id="summon-folder" maxLength={60} value={folder} onChange={(e) => setFolder(e.target.value)} disabled={busy} />
          </div>
          {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
          <Button type="submit" disabled={busy || !url.trim()}>
            {busy ? copy.working : copy.submit}
          </Button>
        </form>
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-meta font-semibold text-ink">{copy.opmlTitle}</p>
          <p className="mt-0.5 text-meta text-subtle">{copy.opmlBody}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".opml,.xml,text/xml,application/xml,text/x-opml"
            className="sr-only"
            id="summon-opml"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button variant="secondary" size="sm" className="mt-3" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden strokeWidth={1.75} />
            {copy.opmlButton}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
