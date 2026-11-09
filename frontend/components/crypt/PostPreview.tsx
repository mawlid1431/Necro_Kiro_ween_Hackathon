"use client";

import { useState } from "react";
import { Bookmark, Globe, Heart, MessageCircle, Repeat2, Send, ThumbsUp } from "lucide-react";
import { PlatformIcon, type Platform } from "@/components/brand/PlatformIcon";
import { resurrect as copy } from "@/lib/copy";
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

function Avatar({ a, size = "size-10" }: { a: Author; size?: string }) {
  return a.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- the user's own Clerk avatar
    <img src={a.imageUrl} alt="" className={cn(size, "shrink-0 rounded-full object-cover")} />
  ) : (
    <span className={cn(size, "grid shrink-0 place-items-center rounded-full bg-ecto/40 font-display font-bold text-ink")}>{a.name.slice(0, 1).toUpperCase()}</span>
  );
}

/** Text with hashtags highlighted, cut to `lines` with a "…more" toggle like the real feeds. */
function PostText({ text, tags, lines, tagClass }: { text: string; tags: string[]; lines: number; tagClass: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > lines * 70;
  return (
    <div className="text-[0.875rem] leading-5 whitespace-pre-line text-[#1d1d1f]">
      <p className={cn(!open && long && (lines === 3 ? "line-clamp-3" : "line-clamp-5"))}>{text}</p>
      {long ? (
        <button type="button" onClick={() => setOpen(!open)} className="text-[0.8125rem] font-semibold text-[#666] hover:underline">
          {open ? copy.less : copy.more}
        </button>
      ) : null}
      {tags.length ? <p className={cn("mt-1", tagClass)}>{tags.join(" ")}</p> : null}
    </div>
  );
}

/** Link card as the platforms render it: big title block on the source's brand-neutral art. */
function LinkCard({ article, rounded }: { article: Article; rounded: string }) {
  return (
    <div className={cn("overflow-hidden border border-[#e0e0e0]", rounded)}>
      <div className="grid aspect-[1.91/1] place-items-center bg-gradient-to-br from-[#14161c] via-[#1f2a24] to-[#2b4a37] px-6 text-center">
        <p className="line-clamp-3 font-display text-[1.05rem] leading-6 font-bold text-white">{article.title}</p>
      </div>
      <div className="bg-[#f4f2ee] px-3 py-2">
        <p className="line-clamp-1 text-[0.8125rem] font-semibold text-[#1d1d1f]">{article.title}</p>
        <p className="text-[0.75rem] text-[#666]">{hostOf(article.link) || article.source}</p>
      </div>
    </div>
  );
}

/** A realistic look at the post before sharing it. Purely visual: nothing is sent anywhere. */
export function PostPreview({ platform, text, tags, author, article }: { platform: Platform; text: string; tags: string[]; author: Author; article: Article }) {
  if (platform === "linkedin") {
    return (
      <div className="rounded-lg border border-[#e0e0e0] bg-white shadow-sm">
        <div className="flex items-start gap-2 px-3 pt-3">
          <Avatar a={author} size="size-11" />
          <div className="min-w-0 leading-4">
            <p className="truncate text-[0.875rem] font-semibold text-[#1d1d1f]">{author.name}</p>
            <p className="truncate text-[0.75rem] text-[#666]">{copy.previewHeadline}</p>
            <p className="flex items-center gap-1 text-[0.75rem] text-[#666]">
              {copy.now} · <Globe aria-hidden className="size-3" />
            </p>
          </div>
          <PlatformIcon platform="linkedin" brand className="ml-auto size-5 shrink-0" />
        </div>
        <div className="px-3 py-2">
          <PostText text={text} tags={tags} lines={3} tagClass="font-semibold text-[#0A66C2]" />
        </div>
        <LinkCard article={article} rounded="rounded-none border-x-0" />
        <div className="flex justify-around border-t border-[#e0e0e0] px-2 py-1.5 text-[0.75rem] font-semibold text-[#666]">
          {[
            [ThumbsUp, "Like"],
            [MessageCircle, "Comment"],
            [Repeat2, "Repost"],
            [Send, "Send"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof ThumbsUp;
            return (
              <span key={label as string} className="flex items-center gap-1 px-2 py-1">
                <I aria-hidden className="size-4" /> {label as string}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  if (platform === "x") {
    return (
      <div className="flex gap-2.5 rounded-2xl border border-[#eff3f4] bg-white p-3 shadow-sm">
        <Avatar a={author} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[0.875rem]">
            <span className="truncate font-bold text-[#0f1419]">{author.name}</span>
            <span className="truncate text-[#536471]">@{author.handle} · {copy.nowShort}</span>
            <PlatformIcon platform="x" brand className="ml-auto size-4 shrink-0" />
          </p>
          <div className="mt-0.5">
            <PostText text={text} tags={tags} lines={5} tagClass="text-[#1d9bf0]" />
          </div>
          <div className="mt-2">
            <LinkCard article={article} rounded="rounded-2xl" />
          </div>
          <div className="mt-2 flex justify-between pr-6 text-[#536471]">
            <MessageCircle aria-hidden className="size-4" />
            <Repeat2 aria-hidden className="size-4" />
            <Heart aria-hidden className="size-4" />
            <Bookmark aria-hidden className="size-4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#dbdbdb] bg-white shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="rounded-full bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#4F5BD5] p-[2px]">
          <span className="block rounded-full bg-white p-[2px]">
            <Avatar a={author} size="size-7" />
          </span>
        </span>
        <span className="text-[0.8125rem] font-semibold text-[#262626]">{author.handle}</span>
        <PlatformIcon platform="instagram" brand className="ml-auto size-5" />
      </div>
      <div className="grid aspect-square place-items-center bg-gradient-to-br from-[#14161c] via-[#1f2a24] to-[#2b4a37] p-8 text-center">
        <div>
          <p className="text-overline font-bold tracking-[0.14em] text-[#9be8a8] uppercase">{article.source}</p>
          <p className="mt-3 line-clamp-5 font-display text-[1.35rem] leading-7 font-bold text-white">{article.title}</p>
          <p className="mt-4 text-[0.75rem] text-white/70">{copy.linkInBio}</p>
        </div>
      </div>
      <div className="flex gap-3 px-3 pt-2 text-[#262626]">
        <Heart aria-hidden className="size-5" />
        <MessageCircle aria-hidden className="size-5" />
        <Send aria-hidden className="size-5" />
        <Bookmark aria-hidden className="ml-auto size-5" />
      </div>
      <div className="px-3 pt-1.5 pb-3">
        <PostText text={`${author.handle}  ${text}`} tags={tags} lines={3} tagClass="text-[#00376b]" />
      </div>
    </div>
  );
}
