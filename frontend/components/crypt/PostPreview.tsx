"use client";

import { Fragment, useEffect, useState } from "react";
import { BarChart3, Bookmark, Globe, Heart, Link2, MessageCircle, Music2, Repeat2, Send, Share, ThumbsUp } from "lucide-react";
import type { LinkPreview } from "@/app/api/link-preview/route";
import { PlatformIcon, type SocialPlatform } from "@/components/brand/PlatformIcon";
import { resurrect as copy } from "@/lib/copy";
import { postImageUrl, URL_RE } from "@/lib/post";
import { cn } from "@/lib/utils";

export type Author = { name: string; imageUrl?: string; handle: string };
export type Article = { title: string; link?: string; source: string };

const hostOf = (u?: string) => {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

/** The card X and LinkedIn will draw: read from the article's own Open Graph tags, like the platforms do. */
function useLinkPreview(link?: string): { data: LinkPreview | null; loading: boolean } {
  const [state, setState] = useState<{ link?: string; data: LinkPreview | null }>({ data: null });
  useEffect(() => {
    if (!link) return;
    let live = true;
    fetch(`/api/link-preview?url=${encodeURIComponent(link)}`)
      .then((r) => (r.ok ? (r.json() as Promise<LinkPreview>) : null))
      .catch(() => null)
      .then((data) => live && setState({ link, data }));
    return () => {
      live = false;
    };
  }, [link]);
  return { data: state.link === link ? state.data : null, loading: !!link && state.link !== link };
}

function Avatar({ a, size = "size-10" }: { a: Author; size?: string }) {
  return a.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- the user's own Clerk avatar
    <img src={a.imageUrl} alt="" className={cn(size, "shrink-0 rounded-full object-cover")} />
  ) : (
    <span className={cn(size, "grid shrink-0 place-items-center rounded-full bg-ecto/40 font-display font-bold text-ink")}>{a.name.slice(0, 1).toUpperCase()}</span>
  );
}

/** The post text as the platform prints it: line breaks kept, links and hashtags coloured, nothing reworded. */
function RichText({ text, linkClass, linkify }: { text: string; linkClass: string; linkify: boolean }) {
  const parts = text.split(/(https?:\/\/[^\s]+|#[\p{L}\p{N}_]+)/u);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        const isUrl = /^https?:\/\//.test(part);
        if (isUrl && !linkify) return <Fragment key={i}>{part}</Fragment>;
        if (isUrl || part.startsWith("#")) {
          const shown = isUrl ? part.replace(/^https?:\/\/(www\.)?/, "").replace(/(.{26}).+/, "$1…") : part;
          return (
            <span key={i} className={linkClass}>
              {shown}
            </span>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

/** Clamped like the feed, with the platform's own "more" toggle. `lines = 0` shows everything (X). */
function PostText({ text, lines, linkClass, linkify = true, lead, moreLabel }: { text: string; lines: number; linkClass: string; linkify?: boolean; lead?: string; moreLabel: string }) {
  const [open, setOpen] = useState(false);
  const long = lines > 0 && (text.length > lines * 60 || text.split("\n").length > lines);
  return (
    <div className="text-[0.875rem] leading-5 break-words whitespace-pre-line">
      <p className={cn(!open && long && (lines === 2 ? "line-clamp-2" : "line-clamp-3"))}>
        {lead ? <span className="mr-1.5 font-semibold">{lead}</span> : null}
        <RichText text={text} linkClass={linkClass} linkify={linkify} />
      </p>
      {long ? (
        <button type="button" onClick={() => setOpen(!open)} className="text-[0.8125rem] text-[#737373] hover:underline">
          {open ? copy.less : moreLabel}
        </button>
      ) : null}
    </div>
  );
}

function CardImage({ src, className }: { src: string; className: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  // eslint-disable-next-line @next/next/no-img-element -- the article's own share image, shown as the platforms show it
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={className} />;
}

function CardSkeleton({ rounded }: { rounded: string }) {
  return <div className={cn("aspect-[1.91/1] animate-pulse border border-[#e0e0e0] bg-[#f1f1f1]", rounded)} aria-label={copy.cardLoading} />;
}

function XCard({ card, loading }: { card: LinkPreview | null; loading: boolean }) {
  if (loading) return <CardSkeleton rounded="rounded-2xl" />;
  if (!card) return null;
  if (card.card === "summary_large_image" && card.image) {
    return (
      <div>
        <div className="relative overflow-hidden rounded-2xl border border-[#cfd9de]">
          <CardImage src={card.image} className="aspect-[1.91/1] w-full object-cover" />
          {card.title ? (
            <span className="absolute bottom-3 left-3 max-w-[85%] truncate rounded bg-black/75 px-1.5 py-0.5 text-[0.8125rem] text-white">{card.title}</span>
          ) : null}
        </div>
        <p className="mt-1 text-[0.8125rem] text-[#536471]">{copy.fromDomain(card.domain)}</p>
      </div>
    );
  }
  return (
    <div className="flex overflow-hidden rounded-2xl border border-[#cfd9de]">
      <div className="grid size-[6.5rem] shrink-0 place-items-center border-r border-[#cfd9de] bg-[#f7f9f9]">
        {card.image ? <CardImage src={card.image} className="size-full object-cover" /> : <Link2 aria-hidden className="size-6 text-[#536471]" />}
      </div>
      <div className="min-w-0 self-center px-3 py-2 text-[0.875rem] leading-5">
        <p className="truncate text-[#536471]">{card.domain}</p>
        {card.title ? <p className="truncate text-[#0f1419]">{card.title}</p> : null}
        {card.description ? <p className="line-clamp-2 text-[#536471]">{card.description}</p> : null}
      </div>
    </div>
  );
}

function LinkedInCard({ card, loading }: { card: LinkPreview | null; loading: boolean }) {
  if (loading) return <CardSkeleton rounded="rounded-none border-x-0" />;
  if (!card) return null;
  if (!card.image) {
    return (
      <div className="mx-3 mb-2 flex items-center gap-3 rounded-lg border border-[#e0e0e0] p-2">
        <div className="grid size-14 shrink-0 place-items-center rounded bg-[#f3f2ef]">
          <Link2 aria-hidden className="size-5 text-[#666]" />
        </div>
        <div className="min-w-0">
          {card.title ? <p className="line-clamp-2 text-[0.875rem] font-semibold text-[#1d1d1f]">{card.title}</p> : null}
          <p className="text-[0.75rem] text-[#666]">{card.domain}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="border-y border-[#e0e0e0]">
      <CardImage src={card.image} className="aspect-[1.91/1] w-full object-cover" />
      <div className="bg-[#eef3f8] px-3 py-2">
        {card.title ? <p className="line-clamp-2 text-[0.875rem] font-semibold text-[#1d1d1f]">{card.title}</p> : null}
        <p className="text-[0.75rem] text-[#666]">{card.domain}</p>
      </div>
    </div>
  );
}

/**
 * The post as it will appear, built from the exact text that is shared (`post`).
 * Link cards come from the article's own tags, the Instagram image is the PNG you download. Nothing is sent anywhere.
 */
export function PostPreview({ platform, post, author, article }: { platform: SocialPlatform; post: string; author: Author; article: Article }) {
  const link = platform === "instagram" || platform === "tiktok" ? undefined : post.match(URL_RE)?.[0] ?? undefined;
  const { data: card, loading } = useLinkPreview(link);

  if (platform === "linkedin") {
    return (
      <div className="rounded-lg border border-[#e0e0e0] bg-white text-[#1d1d1f] shadow-sm">
        <div className="flex items-start gap-2 px-3 pt-3">
          <Avatar a={author} size="size-12" />
          <div className="min-w-0 leading-4">
            <p className="truncate text-[0.875rem] font-semibold">{author.name}</p>
            <p className="truncate text-[0.75rem] text-[#666]">{copy.previewHeadline}</p>
            <p className="flex items-center gap-1 text-[0.75rem] text-[#666]">
              {copy.now} · <Globe aria-hidden className="size-3" />
            </p>
          </div>
          <PlatformIcon platform="linkedin" brand className="ml-auto size-5 shrink-0" />
        </div>
        <div className="px-3 py-2">
          <PostText text={post} lines={3} linkClass="font-semibold text-[#0A66C2]" moreLabel={copy.more} />
        </div>
        <LinkedInCard card={card} loading={loading} />
        <div className="flex justify-around border-t border-[#e0e0e0] px-2 py-1.5 text-[0.75rem] font-semibold text-[#666]">
          {(
            [
              [ThumbsUp, "Like"],
              [MessageCircle, "Comment"],
              [Repeat2, "Repost"],
              [Send, "Send"],
            ] as const
          ).map(([I, label]) => (
            <span key={label} className="flex items-center gap-1 px-2 py-1">
              <I aria-hidden className="size-4" /> {label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (platform === "x") {
    // X hides a link that ends the post when it draws a card for it.
    const shown = card && link && post.trimEnd().endsWith(link) ? post.trimEnd().slice(0, -link.length).trimEnd() : post;
    return (
      <div className="flex gap-2.5 rounded-2xl border border-[#eff3f4] bg-white p-3 text-[#0f1419] shadow-sm">
        <Avatar a={author} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[0.875rem]">
            <span className="truncate font-bold">{author.name}</span>
            <span className="truncate text-[#536471]">@{author.handle} · {copy.nowShort}</span>
            <PlatformIcon platform="x" brand className="ml-auto size-4 shrink-0" />
          </p>
          <div className="mt-0.5 text-[0.9375rem]">
            <PostText text={shown} lines={0} linkClass="text-[#1d9bf0]" moreLabel={copy.more} />
          </div>
          <div className="mt-2">
            <XCard card={card} loading={loading} />
          </div>
          <div className="mt-2 flex justify-between pr-2 text-[#536471]">
            <MessageCircle aria-hidden className="size-4" />
            <Repeat2 aria-hidden className="size-4" />
            <Heart aria-hidden className="size-4" />
            <BarChart3 aria-hidden className="size-4" />
            <Bookmark aria-hidden className="size-4" />
          </div>
        </div>
      </div>
    );
  }

  if (platform === "tiktok") {
    // A TikTok photo post: the square image centred in the tall, black player, caption over the bottom.
    return (
      <div className="relative mx-auto aspect-[9/16] max-h-[34rem] w-full max-w-[19rem] overflow-hidden rounded-xl bg-black text-white shadow-sm">
        <div className="absolute inset-0 grid place-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- the exact image TikTok will post */}
          <img src={postImageUrl(article.title, article.source || hostOf(article.link))} alt={article.title} className="aspect-square w-full object-cover" />
        </div>
        <div className="absolute top-3 right-3">
          <PlatformIcon platform="tiktok" brand className="size-5" />
        </div>
        <div className="absolute right-2 bottom-24 flex flex-col items-center gap-4 text-[0.6875rem] font-semibold">
          <Avatar a={author} size="size-9" />
          <Heart aria-hidden className="size-7 fill-white" />
          <MessageCircle aria-hidden className="size-7 fill-white" />
          <Bookmark aria-hidden className="size-7 fill-white" />
          <Share aria-hidden className="size-7" />
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pt-10 pb-3 pr-14 [text-shadow:0_1px_2px_rgba(0,0,0,.6)]">
          <p className="text-[0.875rem] font-bold">{author.name}</p>
          <div className="mt-1 text-[0.8125rem] [&_p]:text-white">
            <PostText text={post} lines={2} linkClass="font-bold" linkify={false} moreLabel={copy.more} />
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[0.75rem]">
            <Music2 aria-hidden className="size-3.5" /> {copy.tiktokSound}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#dbdbdb] bg-white text-[#262626] shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="rounded-full bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] p-[2px]">
          <span className="block rounded-full bg-white p-[2px]">
            <Avatar a={author} size="size-7" />
          </span>
        </span>
        <span className="text-[0.8125rem] font-semibold">{author.handle}</span>
        <PlatformIcon platform="instagram" brand className="ml-auto size-5" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- the exact PNG the share button downloads */}
      <img src={postImageUrl(article.title, article.source || hostOf(article.link))} alt={article.title} className="aspect-square w-full bg-[#1f2a24] object-cover" />
      <div className="flex gap-3 px-3 pt-2">
        <Heart aria-hidden className="size-5" />
        <MessageCircle aria-hidden className="size-5" />
        <Send aria-hidden className="size-5" />
        <Bookmark aria-hidden className="ml-auto size-5" />
      </div>
      <div className="px-3 pt-1.5 pb-3">
        {/* Instagram captions do not turn links into links. */}
        <PostText lead={author.handle} text={post} lines={2} linkClass="text-[#00376b]" linkify={false} moreLabel={copy.igMore} />
      </div>
    </div>
  );
}
