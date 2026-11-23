"use client";

import { useState } from "react";
import { TOPIC_LABELS, type Topic } from "@backend/lib/topics";
import { cn } from "@/lib/utils";

/** The article's topic. `by` says who decided it: an AI model (after a Séance) or Necro's keyword match. */
export function TopicChip({ topic, by, className }: { topic: Topic | string; by?: "ai" | "keywords"; className?: string }) {
  if (!topic || topic === "other") return null;
  const label = TOPIC_LABELS[topic as Topic] ?? topic;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center rounded-full bg-violet-haze/70 px-2 py-0.5 text-[0.6875rem] leading-4 font-semibold text-ink", className)}
      title={by === "ai" ? `Topic: ${label} (checked by AI)` : `Topic: ${label} (from the article's words and the feed's categories)`}
    >
      {label}
    </span>
  );
}

/**
 * An article's lead image from its feed. Lazy, sends no referrer, keeps a fixed shape so the layout never jumps,
 * and removes itself if the image fails to load (broken link, hotlink protection).
 */
export function ArticleImage({ src, className, sizes }: { src: string | null | undefined; className?: string; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote images from any feed host; next/image needs a fixed allowlist
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      sizes={sizes}
      onError={() => setFailed(true)}
      className={cn("bg-surface-muted object-cover", className)}
    />
  );
}

/** True when the article body already shows this image, so the reader does not show it twice. */
export function bodyHasImage(html: string, src: string | null | undefined): boolean {
  if (!src) return false;
  try {
    const path = new URL(src).pathname;
    return path.length > 1 && html.includes(path);
  } catch {
    return false;
  }
}
