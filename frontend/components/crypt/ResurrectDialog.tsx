"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { Tabs } from "radix-ui";
import { CheckCircle2, Copy, ExternalLink, Loader2, Send, Share2, Sparkles } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { ConnectionView } from "@backend/convex/social";
import type { TikTokCreator } from "@backend/lib/social/providers";
import { PlatformIcon, type Platform, type SocialPlatform } from "@/components/brand/PlatformIcon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice, Textarea } from "@/components/ui/field";
import { connectors as names, resurrect as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { draftFor, finalPost, POST_LIMITS, postLength } from "@/lib/post";
import { copyText, shareByHand, shareSheet } from "@/lib/share";
import { PostPreview, type Article } from "./PostPreview";
import { ScheduleControl } from "./ScheduleControl";

type Draft = { _id: Id<"drafts">; platform: Platform; text: string; hashtags: string[]; status: string; ghost: boolean };
type PublishRow = { platform: SocialPlatform; status: "posting" | "posted" | "failed"; url?: string; note?: string; error?: string };

const LIMITS: Record<SocialPlatform, number> = { linkedin: 1300, x: 280, instagram: 2200, tiktok: POST_LIMITS.tiktok };
const ORDER: SocialPlatform[] = ["linkedin", "x", "instagram", "tiktok"];

const hostOf = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

const noSubscribe = () => () => {};

type TikTokChoice = { privacyLevel: string; allowComments: boolean; commercial: boolean; yourBrand: boolean; brandedContent: boolean };

/** What TikTok's content-sharing rules require on the post screen: creator name, privacy (no default), comments, disclosure, consent. */
function TikTokOptions({ value, onChange, creator, error }: { value: TikTokChoice; onChange: (v: TikTokChoice) => void; creator: TikTokCreator | null | undefined; error: string | null }) {
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!creator) return <p className="text-meta text-subtle">{copy.tiktokLoading}</p>;
  const set = (patch: Partial<TikTokChoice>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line p-3 text-meta">
      <legend className="px-1 font-semibold text-ink">{copy.tiktokAs(creator.nickname || creator.username || "TikTok")}</legend>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{copy.tiktokWho}</span>
        <select
          value={value.privacyLevel}
          onChange={(e) => set({ privacyLevel: e.target.value })}
          className="rounded-md border border-line bg-surface px-2 py-2 text-body"
        >
          <option value="" disabled>
            {copy.tiktokChoose}
          </option>
          {creator.privacyOptions.map((o) => (
            <option key={o} value={o} disabled={value.brandedContent && o === "SELF_ONLY"}>
              {copy.tiktokPrivacy[o] ?? o}
            </option>
          ))}
        </select>
      </label>
      <label className={cn("flex items-center gap-2", creator.commentDisabled && "opacity-50")}>
        <input type="checkbox" checked={value.allowComments && !creator.commentDisabled} disabled={creator.commentDisabled} onChange={(e) => set({ allowComments: e.target.checked })} />
        {creator.commentDisabled ? copy.tiktokCommentsOff : copy.tiktokComments}
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={value.commercial} onChange={(e) => set({ commercial: e.target.checked, yourBrand: false, brandedContent: false })} />
        {copy.tiktokCommercial}
      </label>
      {value.commercial ? (
        <div className="flex flex-col gap-2 pl-6">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value.yourBrand} onChange={(e) => set({ yourBrand: e.target.checked })} />
            {copy.tiktokYourBrand}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.brandedContent}
              onChange={(e) => set({ brandedContent: e.target.checked, privacyLevel: e.target.checked && value.privacyLevel === "SELF_ONLY" ? "" : value.privacyLevel })}
            />
            {copy.tiktokBranded}
          </label>
          {value.brandedContent ? <p className="text-subtle">{copy.tiktokBrandedPrivate}</p> : null}
        </div>
      ) : null}
      <p className="text-subtle">{copy.tiktokConsent}</p>
    </fieldset>
  );
}

/** "Post now" with the platform's API, and its live status from Convex. Falls back to "connect first". */
function DirectPost({
  p,
  draftId,
  text,
  over,
  conn,
  last,
  locked,
}: {
  p: SocialPlatform;
  draftId: Id<"drafts">;
  text: string;
  over: boolean;
  conn: ConnectionView | undefined;
  last: PublishRow | undefined;
  locked: boolean; // already posted or waiting on this platform: one post, once
}) {
  const publish = useAction(api.socialNode.publish);
  const loadCreator = useAction(api.socialNode.tiktokCreator);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [creator, setCreator] = useState<TikTokCreator | null | undefined>(undefined);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [tt, setTt] = useState<TikTokChoice>({ privacyLevel: "", allowComments: false, commercial: false, yourBrand: false, brandedContent: false });
  const name = names.names[p];
  const ready = conn?.connected && conn.status !== "expired";

  useEffect(() => {
    if (p !== "tiktok" || !ready || creator !== undefined) return;
    loadCreator({})
      .then((c) => setCreator(c))
      .catch((e) => setCreatorError(errorMessage(e)));
  }, [p, ready, creator, loadCreator]);

  if (!conn?.configured) return null;
  if (!ready) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-muted px-3 py-2 text-meta">
        <PlatformIcon platform={p} brand className="size-4" />
        <span className="font-semibold">{conn?.connected ? copy.reconnect(name) : copy.connectFirst(name)}</span>
        <Button asChild variant="link" size="sm" className="ml-auto h-auto p-0">
          <Link href="/settings#connections">{copy.openConnectors}</Link>
        </Button>
      </div>
    );
  }

  const ttInvalid = p === "tiktok" && (!tt.privacyLevel || (tt.commercial && !tt.yourBrand && !tt.brandedContent));
  const posting = sending || last?.status === "posting";

  async function go() {
    setSending(true);
    setError(null);
    try {
      await publish({
        draftId,
        platform: p,
        text,
        ...(p === "tiktok" ? { tiktok: { privacyLevel: tt.privacyLevel, allowComments: tt.allowComments && !creator?.commentDisabled, yourBrand: tt.yourBrand, brandedContent: tt.brandedContent } } : {}),
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {p === "tiktok" ? <TikTokOptions value={tt} onChange={setTt} creator={creator} error={creatorError} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void go()} disabled={over || posting || ttInvalid || locked}>
          {posting ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden strokeWidth={1.75} />}
          {posting ? copy.posting : copy.postNow(name)}
        </Button>
        <span className="flex items-center gap-1.5 text-meta text-subtle">
          {conn.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the connected account's own picture
            <img src={conn.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-5 rounded-full object-cover" />
          ) : null}
          {conn.username ? `@${conn.username}` : conn.name}
        </span>
      </div>
      {last && !sending ? (
        <div aria-live="polite">
          {last.status === "posted" ? (
            <Notice tone="ok">
              <span className="inline-flex flex-wrap items-center gap-2">
                <CheckCircle2 aria-hidden className="size-4" />
                {last.note === "processing" ? copy.processing : copy.posted}
                {last.url ? (
                  <a href={last.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                    {copy.viewPost} <ExternalLink aria-hidden className="size-3.5" />
                  </a>
                ) : null}
              </span>
            </Notice>
          ) : last.status === "failed" && !error ? (
            <Notice tone="error">
              {copy.failed}: {last.error}
            </Notice>
          ) : null}
        </div>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

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
  // Live: a connection made in another tab, or a post finishing, shows up here at once.
  const connections = useQuery(api.social.list, open ? {} : "skip");
  const publishes = useQuery(api.social.publishesForItem, open ? { itemId } : "skip");
  // Live: has this article already gone out (or is it waiting) on each platform? Locks the buttons below.
  const postState = useQuery(api.social.postStateForItem, open ? { itemId } : "skip");
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [tab, setTab] = useState<SocialPlatform>("linkedin");
  // The Web Share sheet exists on phones and some desktops; the server render assumes it does not.
  const canNativeShare = useSyncExternalStore(noSubscribe, () => typeof navigator.share === "function", () => false);

  const name = user?.fullName || user?.firstName || user?.username || "You";
  const imageSource = article.source || hostOf(article.link);

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
  // The exact post: shared, copied, counted, previewed and posted from this one string.
  const full = (p: SocialPlatform, d: Draft, text: string) => finalPost(p, text, d.hashtags, article.link);

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

  async function copyDraft(p: SocialPlatform, d: Draft) {
    if (!(await copyText(full(p, d, edits[d._id] ?? d.text)))) return setError(copy.clipboardBlocked);
    setFlash(`${p}:copied`);
    void setStatus({ draftId: d._id, status: "copied" });
  }

  /** One click: copy the post (in case a composer ignores the text), open the composer, save the image where needed. */
  async function share(p: SocialPlatform, d: Draft) {
    const r = await shareByHand(p, full(p, d, edits[d._id] ?? d.text), { title: article.title, source: imageSource });
    if (!r.opened) setError(copy.popupBlocked);
    else if (!r.copied) setError(copy.clipboardBlocked);
    setFlash(`${p}:shared`);
    void setStatus({ draftId: d._id, status: "shared" });
  }

  /** The phone's share sheet, with the post image attached for Instagram and TikTok (and the caption copied). */
  async function nativeShare(p: SocialPlatform, d: Draft) {
    const ok = await shareSheet({
      title: article.title,
      text: full(p, d, edits[d._id] ?? d.text),
      url: article.link,
      image: p === "instagram" || p === "tiktok" ? { title: article.title, source: imageSource } : undefined,
    });
    if (ok) void setStatus({ draftId: d._id, status: "shared" });
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
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as SocialPlatform)}>
          <Tabs.List aria-label={copy.platformLabel} className="mb-4 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
            {ORDER.map((p) => (
              <Tabs.Trigger
                key={p}
                value={p}
                className="-mb-px flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-meta font-semibold text-subtle transition-colors hover:text-ink data-[state=active]:border-ecto-dim data-[state=active]:text-ink"
              >
                <PlatformIcon platform={p} brand={tab === p} className={cn("size-4", tab !== p && "opacity-60")} />
                {p === "tiktok" ? copy.tiktokTab : copy.platforms[p]}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {ORDER.map((p) => {
            const d = byPlatform.get(draftFor(p));
            if (!d) return null;
            const text = edits[d._id] ?? d.text;
            const post = full(p, d, text);
            const total = postLength(p, post);
            const over = total > LIMITS[p];
            const conn = connections?.find((c) => c.platform === p);
            const direct = !!conn?.connected && conn.status !== "expired";
            const st = postState?.find((x) => x.platform === p);
            const locked = !!st?.posted || !!st?.pending;
            return (
              <Tabs.Content key={p} value={p} className="grid gap-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
                <div className="flex min-w-0 flex-col gap-3">
                  {d.ghost ? <Notice>{copy.template}: {copy.templateHint}</Notice> : null}
                  {p === "tiktok" ? <p className="text-meta text-subtle">{copy.tiktokFrom}</p> : null}
                  <Textarea
                    aria-label={`${p === "tiktok" ? copy.tiktokTab : copy.platforms[p as Platform]} draft`}
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

                  {st?.posted ? (
                    <Notice tone="ok">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {copy.alreadyPosted(names.names[p], new Date(st.posted.at))}
                        {st.posted.url ? (
                          <a href={st.posted.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                            {copy.viewPost} <ExternalLink aria-hidden className="size-3.5" />
                          </a>
                        ) : null}
                      </span>
                    </Notice>
                  ) : st?.pending ? (
                    <Notice>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {st.pending.status === "posting" ? copy.goingOut(names.names[p]) : copy.alreadyWaiting(names.names[p], new Date(st.pending.at))}
                        <Link href="/calendar" className="underline">
                          {copy.openWitching}
                        </Link>
                      </span>
                    </Notice>
                  ) : null}
                  <DirectPost p={p} draftId={d._id} text={text} over={over} conn={conn} last={publishes?.find((x) => x.platform === p)} locked={locked} />

                  {direct ? <p className="text-meta text-subtle">{copy.orShare}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button variant={direct ? "secondary" : "default"} onClick={() => void share(p, d)} disabled={over || locked}>
                      <PlatformIcon platform={p} className="size-4" />
                      {flash === `${p}:shared` ? copy.sharedHint : p === "tiktok" ? copy.shareOnTikTok : copy.shareOn(p as Platform)}
                    </Button>
                    <Button variant="secondary" onClick={() => void copyDraft(p, d)} disabled={over}>
                      <Copy aria-hidden strokeWidth={1.75} />
                      {flash === `${p}:copied` ? copy.copied : copy.copy}
                    </Button>
                    {canNativeShare ? (
                      <Button variant="secondary" onClick={() => void nativeShare(p, d)} disabled={over}>
                        <Share2 aria-hidden strokeWidth={1.75} /> {copy.shareSheet}
                      </Button>
                    ) : null}
                  </div>
                  {locked ? null : <ScheduleControl key={`${p}:${d._id}`} platform={p} draftId={d._id} text={text} disabled={over} auto={direct} />}
                  <div className="flex flex-wrap gap-2">
                    {edits[d._id] !== undefined && edits[d._id] !== d.text ? (
                      <Button variant="ghost" size="sm" onClick={() => void save(d)} disabled={text.length > LIMITS[d.platform]}>
                        {flash === `${d._id}:saved` ? copy.saved : copy.save}
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void doRaise()} disabled={busy}>
                      {busy ? copy.working : copy.again}
                    </Button>
                  </div>
                  {(p === "instagram" || p === "tiktok") && !direct ? <p className="text-meta text-subtle">{p === "tiktok" ? copy.tiktokHint : copy.instagramHint}</p> : null}
                </div>

                <div className="min-w-0">
                  <p className="mb-2 text-overline font-bold tracking-[0.12em] text-subtle uppercase">{copy.preview}</p>
                  <PostPreview
                    platform={p}
                    post={post}
                    article={{ ...article, source: imageSource }}
                    author={{
                      // The connected account when there is one: that is who the post will come from.
                      name: (direct && conn?.name) || name,
                      imageUrl: (direct && conn?.avatarUrl) || user?.imageUrl,
                      handle: (direct && conn?.username) || (user?.username || name).toLowerCase().replace(/[^a-z0-9_]/g, "") || "you",
                    }}
                  />
                </div>
              </Tabs.Content>
            );
          })}
        </Tabs.Root>
      ) : null}
    </Dialog>
  );
}
