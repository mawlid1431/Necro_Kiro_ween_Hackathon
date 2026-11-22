"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { ImagePlus, Loader2, Send, Sparkles, X as XIcon } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { PlatformIcon } from "@/components/brand/PlatformIcon";
import { suggestedTime, toLocalInput } from "@/components/crypt/ScheduleControl";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice, Textarea } from "@/components/ui/field";
import { composer as copy, connectors as names } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { POST_LIMITS, postLength, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/post";
import { cn } from "@/lib/utils";

type Upload = { storageId: Id<"_storage">; url: string; contentType: string; name: string };

const ACCEPT = "image/jpeg,image/png";
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Witching Hour's composer: your own image and caption (typed, or written by AI from the image in your voice),
 * to the accounts you pick, now or at a time. Connected accounts post on their own; the others become reminders.
 */
export function Composer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const generateUploadUrl = useMutation(api.social.generateUploadUrl);
  const registerUpload = useMutation(api.social.registerUpload);
  const composePost = useMutation(api.social.composePost);
  const writeCaption = useAction(api.captionNode.writeCaption);
  const connections = useQuery(api.social.list, open ? {} : "skip");

  const fileInput = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");
  const [caption, setCaption] = useState("");
  const [writing, setWriting] = useState(false);
  const [chosen, setChosen] = useState<SocialPlatform[]>([]);
  const [later, setLater] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(suggestedTime()));
  const [minWhen] = useState(() => toLocalInput(Date.now() + 2 * 60_000));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ platform: SocialPlatform; mode: "auto" | "reminder" }[] | null>(null);

  function reset() {
    setUpload(null);
    setNote("");
    setCaption("");
    setChosen([]);
    setLater(false);
    setError(null);
    setDone(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ACCEPT.split(",").includes(file.type) || file.size > MAX_BYTES) return setError(copy.badFile);
    setUploading(true);
    try {
      const url = await generateUploadUrl({});
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!res.ok) throw new Error(copy.uploadFailed);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      const r = await registerUpload({ storageId });
      setUpload({ storageId, url: r.url ?? URL.createObjectURL(file), contentType: r.contentType, name: file.name });
    } catch (e) {
      setError(errorMessage(e, copy.uploadFailed));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function ai() {
    if (!upload) return;
    setWriting(true);
    setError(null);
    try {
      const limit = chosen.length ? Math.min(...chosen.map((p) => POST_LIMITS[p])) - 120 : 1000;
      const r = await writeCaption({ storageId: upload.storageId, note: note || undefined, maxChars: Math.max(limit, 120) });
      setCaption(r.hashtags.length ? `${r.caption}\n\n${r.hashtags.join(" ")}` : r.caption);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setWriting(false);
    }
  }

  const conn = (p: SocialPlatform) => connections?.find((c) => c.platform === p);
  const autoFor = (p: SocialPlatform) => {
    const c = conn(p);
    if (p === "tiktok" || !c?.connected || c.status === "expired" || !c.configured) return false;
    return !(p === "instagram" && upload && upload.contentType !== "image/jpeg");
  };
  const tooLong = chosen.filter((p) => postLength(p, caption.trim()) > POST_LIMITS[p]);
  const needImage = chosen.filter((p) => (p === "instagram" || p === "tiktok") && !upload);
  const canSend = chosen.length > 0 && (caption.trim() || upload) && !tooLong.length && !needImage.length && !uploading && !writing;

  async function send() {
    setSending(true);
    setError(null);
    try {
      const at = later ? new Date(when).getTime() : undefined;
      const r = await composePost({ caption, platforms: chosen, storageId: upload?.storageId, at });
      setDone(r.map(({ platform, mode }) => ({ platform, mode })));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title={copy.title}
      description={copy.body}
      className="max-w-2xl"
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <Notice tone="ok">{later ? copy.doneScheduled(new Date(when)) : copy.doneNow}</Notice>
          <ul className="flex flex-col gap-1 text-meta">
            {done.map((d) => (
              <li key={d.platform} className="flex items-center gap-2">
                <PlatformIcon platform={d.platform} brand className="size-4" />
                <span className="font-semibold">{names.names[d.platform]}</span>
                <span className="text-subtle">{d.mode === "auto" ? (later ? copy.willPost : copy.posting) : copy.reminder}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button onClick={reset}>{copy.another}</Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {copy.close}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* 1. Image */}
          <section className="flex flex-col gap-2">
            <h3 className="text-meta font-bold">{copy.step1}</h3>
            {upload ? (
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- your own uploaded image */}
                <img src={upload.url} alt={upload.name} className="max-h-48 w-auto max-w-[60%] rounded-md border border-line object-contain" />
                <Button size="sm" variant="ghost" onClick={() => setUpload(null)}>
                  <XIcon aria-hidden /> {copy.removeImage}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void onFile(e.dataTransfer.files[0]);
                }}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-meta text-subtle transition-colors",
                  dragging ? "border-ecto-dim bg-ecto/10" : "border-line hover:bg-surface-muted",
                )}
              >
                {uploading ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <ImagePlus aria-hidden className="size-6" />}
                <span className="font-semibold text-ink">{uploading ? copy.uploading : copy.pickImage}</span>
                <span>{copy.imageRules}</span>
              </button>
            )}
            <input ref={fileInput} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </section>

          {/* 2. Caption */}
          <section className="flex flex-col gap-2">
            <h3 className="text-meta font-bold">{copy.step2}</h3>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-meta">
                <span className="text-subtle">{copy.noteLabel}</span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  placeholder={copy.notePlaceholder}
                  className="rounded-md border border-line bg-surface px-2 py-2 text-body"
                />
              </label>
              <Button variant="secondary" onClick={() => void ai()} disabled={!upload || writing}>
                {writing ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden strokeWidth={1.75} />}
                {writing ? copy.writing : copy.writeWithAi}
              </Button>
            </div>
            {!upload ? <p className="text-meta text-subtle">{copy.aiNeedsImage}</p> : null}
            <Textarea aria-label={copy.captionLabel} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={copy.captionPlaceholder} className="min-h-36" />
            {chosen.length ? (
              <p className="flex flex-wrap gap-3 text-meta">
                {chosen.map((p) => {
                  const n = postLength(p, caption.trim());
                  return (
                    <span key={p} className={cn("inline-flex items-center gap-1 font-semibold", n > POST_LIMITS[p] ? "text-danger" : "text-subtle")}>
                      <PlatformIcon platform={p} className="size-3.5" /> {n} / {POST_LIMITS[p]}
                    </span>
                  );
                })}
              </p>
            ) : null}
          </section>

          {/* 3. Accounts */}
          <section className="flex flex-col gap-2">
            <h3 className="text-meta font-bold">{copy.step3}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {SOCIAL_PLATFORMS.map((p) => {
                const on = chosen.includes(p);
                const c = conn(p);
                return (
                  <label key={p} className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-2.5", on ? "border-ecto-dim bg-ecto/10" : "border-line")}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setChosen((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p)))}
                      className="mt-1"
                    />
                    <PlatformIcon platform={p} brand className="mt-0.5 size-5 shrink-0" />
                    <span className="min-w-0 text-meta">
                      <span className="block font-semibold text-ink">
                        {names.names[p]}
                        {c?.connected && (c.username || c.name) ? <span className="ml-1 font-normal text-subtle">{c.username ? `@${c.username}` : c.name}</span> : null}
                      </span>
                      <span className="text-subtle">{autoFor(p) ? copy.autoTag : p === "tiktok" ? copy.tiktokTag : copy.reminderTag}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-meta text-subtle">
              {copy.connectMore}{" "}
              <Link href="/settings#connections" className="font-semibold text-ecto-ink hover:underline">
                {copy.openConnections}
              </Link>
            </p>
          </section>

          {/* 4. When */}
          <section className="flex flex-col gap-2">
            <h3 className="text-meta font-bold">{copy.step4}</h3>
            <div className="flex flex-wrap items-center gap-4 text-meta">
              <label className="flex items-center gap-2">
                <input type="radio" name="when" checked={!later} onChange={() => setLater(false)} /> {copy.now}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="when" checked={later} onChange={() => setLater(true)} /> {copy.schedule}
              </label>
              {later ? (
                <input
                  type="datetime-local"
                  value={when}
                  min={minWhen}
                  onChange={(e) => setWhen(e.target.value)}
                  className="rounded-md border border-line bg-surface px-2 py-1.5 text-body"
                />
              ) : null}
            </div>
          </section>

          {needImage.length ? <Notice>{copy.needsImage(needImage.map((p) => names.names[p]).join(", "))}</Notice> : null}
          {tooLong.length ? <Notice tone="error">{copy.tooLong(tooLong.map((p) => names.names[p]).join(", "))}</Notice> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {copy.close}
            </Button>
            <Button onClick={() => void send()} disabled={!canSend || sending}>
              {sending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden strokeWidth={1.75} />}
              {later ? copy.scheduleBtn : copy.postNowBtn}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
