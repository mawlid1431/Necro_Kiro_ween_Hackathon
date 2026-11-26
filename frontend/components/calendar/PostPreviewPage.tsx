"use client";

import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { api } from "@backend/convex/_generated/api";
import { Container } from "@/components/layout/Container";
import { PostPreview } from "@/components/crypt/PostPreview";

const NAMES = { linkedin: "LinkedIn", x: "X", instagram: "Instagram", tiktok: "TikTok" } as const;

/**
 * /calendar/preview?post=<id>: how a draft (from an AI assistant's draft_post) or a scheduled post will look on each
 * platform, with how it will be delivered. Read-only: nothing here sends anything.
 */
export function PostPreviewPage() {
  const postId = useSearchParams().get("post") ?? "";
  const p = useQuery(api.mcpAgent.previewForPage, postId ? { postId } : "skip");

  return (
    <Container className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-h2 font-bold">Post preview</h1>
        <p className="text-meta text-subtle">How this post will look. Nothing is sent from this page.</p>
      </header>
      {!postId || p === null ? (
        <p className="rounded-2xl border border-line bg-surface p-5 text-copy">This post could not be found.</p>
      ) : p === undefined ? (
        <div aria-busy="true" className="h-64 animate-pulse rounded-2xl bg-surface-muted" />
      ) : (
        <>
          <p className="text-meta">
            Status: <span className="font-semibold">{p.status}</span>
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            {p.platforms.map((platform) => {
              const d = p.delivery.find((x) => x.platform === platform);
              return (
                <section key={platform} className="flex min-w-0 flex-col gap-2">
                  <h2 className="text-overline font-bold tracking-[0.12em] text-subtle uppercase">
                    {NAMES[platform]} · {d?.delivery === "auto" ? "posts automatically" : "reminder"}
                  </h2>
                  <PostPreview
                    platform={platform}
                    post={p.text}
                    image={p.imageUrl}
                    article={p.article ? { title: p.article.title, link: p.article.link ?? undefined, source: p.article.source } : { title: p.text.slice(0, 80), source: "" }}
                    author={{ name: p.author.name, handle: p.author.name.toLowerCase().replace(/\s+/g, "") }}
                  />
                  {d ? <p className="text-[0.8125rem] text-subtle">{d.deliveryNote}</p> : null}
                </section>
              );
            })}
          </div>
        </>
      )}
    </Container>
  );
}
