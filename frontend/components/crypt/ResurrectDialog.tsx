"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useAction, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Tabs } from "radix-ui";
import { Copy, Share2, Sparkles } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { PlatformIcon, type Platform } from "@/components/brand/PlatformIcon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice, Textarea } from "@/components/ui/field";
import { resurrect as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { PostPreview, type Article } from "./PostPreview";

type Draft = { _id: Id<"drafts">; platform: Platform; text: string; hashtags: string[]; status: string; ghost: boolean };

const LIMITS: Record<Platform, number> = { linkedin: 1300, x: 280, instagram: 2200 };
const ORDER: Platform[] = ["linkedin", "x", "instagram"];

/** The platform's own composer with the text filled in (no posting APIs, nothing sent by Necro). */
function shareUrl(p: Platform, text: string, link?: string): string {
  if (p === "x") {
    const withLink = link && !text.includes(link) ? `&url=${encodeURIComponent(link)}` : "";
    return `https://x.com/intent/post?text=${encodeURIComponent(text)}${withLink}`;
  }
  if (p === "linkedin") return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
  return "https://www.instagram.com/"; // Instagram has no web composer: the caption is copied, then pasted in the app
}

const noSubscribe = () => () => {};

export function ResurrectDialog({
  open,
  onOpenChange,
  itemId,
  drafts,
  article,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  itemId: Id<"items">;
  drafts: Draft[];
  article: Article;
}) {
  const raise = useAction(api.aiNode.raiseResurrect);
  const update = useMutation(api.drafts.update);
  const setStatus = useMutation(api.drafts.setStatus);
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [tab, setTab] = useState<Platform>("linkedin");
  // The Web Share sheet exists on phones and some desktops; the server render assumes it does not.
  const canNativeShare = useSyncExternalStore(noSubscribe, () => typeof navigator.share === "function", () => false);

  const name = user?.fullName || user?.firstName || user?.username || "You";
  const author = { name, imageUrl: user?.imageUrl, handle: (user?.username || name).toLowerCase().replace(/[^a-z0-9_]/g, "") || "you" };

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

  async function toClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      setError(copy.clipboardBlocked);
      return false;
    }
  }

  async function copyDraft(d: Draft) {
    if (!(await toClipboard(full(d, edits[d._id] ?? d.text)))) return;
    setFlash(`${d._id}:copied`);
    void setStatus({ draftId: d._id, status: "copied" });
  }

  /** One click: copy the post (so it can be pasted if a composer ignores the text), open the composer, mark shared. */
  async function share(d: Draft) {
    const text = full(d, edits[d._id] ?? d.text);
    // Start the copy while this page still has focus, then open the tab synchronously inside the click
    // (popup blockers only allow that). "noopener" would make window.open return null, so cut the opener by hand.
    const copied = toClipboard(text);
    const win = window.open(shareUrl(d.platform, text, article.link), "_blank");
    if (win) win.opener = null;
    else setError(copy.popupBlocked);
    await copied;
    setFlash(`${d._id}:shared`);
    void setStatus({ draftId: d._id, status: "shared" });
  }

  async function nativeShare(d: Draft) {
    try {
      await navigator.share({ title: article.title, text: full(d, edits[d._id] ?? d.text), url: article.link });
      void setStatus({ draftId: d._id, status: "shared" });
    } catch {
      // the user closed the share sheet: nothing to do
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={copy.title} description={copy.body} className="max-w-4xl">
      {busy && drafts.length === 0 ? (
        <p role="status" className="flex items-center gap-2 py-10 text-meta text-subtle">
          <Sparkles aria-hidden className="size-4 animate-pulse text-ecto-ink" /> {copy.working}
        </p>
      ) : null}
      {error ? (
        <div className="mb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      {drafts.length ? (
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Platform)}>
          <Tabs.List aria-label={copy.platformLabel} className="mb-4 flex gap-1 border-b border-line">
            {ORDER.map((p) => (
              <Tabs.Trigger
                key={p}
                value={p}
                className="-mb-px flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-meta font-semibold text-subtle transition-colors hover:text-ink data-[state=active]:border-ecto-dim data-[state=active]:text-ink"
              >
                <PlatformIcon platform={p} brand={tab === p} className={cn("size-4", tab !== p && "opacity-60")} />
                {copy.platforms[p]}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {ORDER.map((p) => {
            const d = byPlatform.get(p);
            if (!d) return null;
            const text = edits[d._id] ?? d.text;
            const total = full(d, text).length;
            const over = total > LIMITS[p];
            return (
              <Tabs.Content key={p} value={p} className="grid gap-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
                <div className="flex min-w-0 flex-col gap-3">
                  {d.ghost ? <Notice>{copy.template}: {copy.templateHint}</Notice> : null}
                  <Textarea
                    aria-label={`${copy.platforms[p]} draft`}
                    value={text}
                    onChange={(e) => setEdits((s) => ({ ...s, [d._id]: e.target.value }))}
                    className="min-h-56 lg:min-h-72"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-meta">
                    <span className={cn("font-semibold", over ? "text-danger" : "text-subtle")}>
                      {total} / {LIMITS[p]}
                    </span>
                    {over ? <span className="text-danger">{copy.tooLong}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void share(d)} disabled={over}>
                      <PlatformIcon platform={p} className="size-4" />
                      {flash === `${d._id}:shared` ? copy.sharedHint : copy.shareOn(p)}
                    </Button>
                    <Button variant="secondary" onClick={() => void copyDraft(d)} disabled={over}>
                      <Copy aria-hidden strokeWidth={1.75} />
                      {flash === `${d._id}:copied` ? copy.copied : copy.copy}
                    </Button>
                    {canNativeShare ? (
                      <Button variant="secondary" onClick={() => void nativeShare(d)} disabled={over}>
                        <Share2 aria-hidden strokeWidth={1.75} /> {copy.shareSheet}
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {edits[d._id] !== undefined && edits[d._id] !== d.text ? (
                      <Button variant="ghost" size="sm" onClick={() => void save(d)} disabled={over}>
                        {flash === `${d._id}:saved` ? copy.saved : copy.save}
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void doRaise()} disabled={busy}>
                      {busy ? copy.working : copy.again}
                    </Button>
                  </div>
                  {p === "instagram" ? <p className="text-meta text-subtle">{copy.instagramHint}</p> : null}
                </div>

                <div className="min-w-0">
                  <p className="mb-2 text-overline font-bold tracking-[0.12em] text-subtle uppercase">{copy.preview}</p>
                  <PostPreview platform={p} text={text} tags={d.hashtags} author={author} article={article} />
                </div>
              </Tabs.Content>
            );
          })}
        </Tabs.Root>
      ) : null}
    </Dialog>
  );
}
