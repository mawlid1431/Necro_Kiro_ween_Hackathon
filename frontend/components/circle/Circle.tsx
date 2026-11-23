"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ExternalLink, Globe, Loader2, Lock, Plus, Rss, UserCheck, UserPlus, Users } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { TOPIC_LABELS, type Topic } from "@backend/lib/topics";
import { PlatformIcon } from "@/components/brand/PlatformIcon";
import { ArticleImage, TopicChip } from "@/components/crypt/media";
import { timeAgo } from "@/components/crypt/ItemList";
import { Button } from "@/components/ui/button";
import { Card, Notice, Textarea } from "@/components/ui/field";
import { circle as copy, connectors, tabs } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Post = FunctionReturnType<typeof api.circle.following>["posts"][number];
type Person = FunctionReturnType<typeof api.circle.people>[number];

// ---------- small pieces ----------

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return (
    <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-violet-haze font-semibold text-ink", className)}>
      {initials || "?"}
    </span>
  );
}

/** Follow / Following toggle. Live: counts and streams update everywhere the moment it changes. */
export function FollowButton({ slug, isFollowing, size = "sm" }: { slug: string; isFollowing: boolean; size?: "sm" | "default" }) {
  const follow = useMutation(api.circle.follow);
  const unfollow = useMutation(api.circle.unfollow);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (isFollowing) await unfollow({ slug });
      else await follow({ slug });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size={size}
        variant={isFollowing ? "secondary" : "default"}
        onClick={() => void toggle()}
        disabled={busy}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-pressed={isFollowing}
      >
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : isFollowing ? <UserCheck aria-hidden strokeWidth={1.75} /> : <UserPlus aria-hidden strokeWidth={1.75} />}
        {isFollowing ? (hover ? copy.unfollow : copy.followingBtn) : copy.follow}
      </Button>
      {error ? <span role="alert" className="text-[0.75rem] text-danger">{error}</span> : null}
    </span>
  );
}

/** "Add this feed": the source of a good post comes back to life in your own Graveyard. */
function AddFeedButton({ url }: { url: string }) {
  const summon = useAction(api.feedsNode.summon);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  async function add() {
    setState("busy");
    setError(null);
    try {
      await summon({ url });
      setState("done");
    } catch (e) {
      setError(errorMessage(e));
      setState("idle");
    }
  }
  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-meta font-semibold text-ecto-ink">
        <Check aria-hidden className="size-4" /> {copy.addedFeed}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button size="sm" variant="secondary" onClick={() => void add()} disabled={state === "busy"}>
        {state === "busy" ? <Loader2 aria-hidden className="animate-spin" /> : <Rss aria-hidden strokeWidth={1.75} />}
        {copy.addFeed}
      </Button>
      {error ? <span role="alert" className="text-[0.75rem] text-danger">{error}</span> : null}
    </span>
  );
}

// ---------- a published post ----------

export function PostCard({ post, showFollow = true }: { post: Post; showFollow?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = post.text.length > 280;
  return (
    <article className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <Link href={`/circle/${post.author.slug}`} className="shrink-0 rounded-full">
          <Avatar name={post.author.name} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/circle/${post.author.slug}`} className="font-semibold text-ink hover:underline">
            {post.author.name}
          </Link>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-subtle">
            <span className="inline-flex items-center gap-1">
              <PlatformIcon platform={post.platform} className="size-3.5" aria-hidden />
              {connectors.names[post.platform]}
            </span>
            <span aria-hidden>·</span>
            <time dateTime={new Date(post.postedAt).toISOString()}>{timeAgo(post.postedAt)}</time>
            <TopicChip topic={post.topic} />
          </p>
        </div>
        {showFollow ? <FollowButton slug={post.author.slug} isFollowing={post.isFollowing} /> : null}
      </header>

      {post.text ? (
        <div className="mt-3">
          <p className={cn("text-copy whitespace-pre-line", !expanded && long && "line-clamp-5")}>{post.text}</p>
          {long ? (
            <button onClick={() => setExpanded((x) => !x)} className="mt-1 text-meta font-semibold text-ecto-ink hover:underline">
              {expanded ? copy.showLess : copy.showMore}
            </button>
          ) : null}
        </div>
      ) : null}

      {post.itemTitle ? (
        <div className="mt-3 flex gap-3 overflow-hidden rounded-lg border border-line bg-surface-muted/50">
          <ArticleImage src={post.imageUrl} className="w-24 shrink-0 self-stretch sm:w-32" />
          <div className="min-w-0 flex-1 p-3">
            {post.feedTitle ? <p className="text-overline font-bold text-subtle uppercase">{copy.feedFrom(post.feedTitle)}</p> : null}
            {post.itemLink ? (
              <a href={post.itemLink} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 line-clamp-2 font-semibold text-ink hover:underline">
                {post.itemTitle}
              </a>
            ) : (
              <p className="mt-0.5 line-clamp-2 font-semibold text-ink">{post.itemTitle}</p>
            )}
          </div>
        </div>
      ) : null}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {post.url ? (
          <Button asChild size="sm" variant="ghost">
            <a href={post.url} target="_blank" rel="noopener noreferrer nofollow">
              <ExternalLink aria-hidden strokeWidth={1.75} />
              {copy.viewPost}
            </a>
          </Button>
        ) : null}
        {post.feedUrl ? <AddFeedButton url={post.feedUrl} /> : null}
      </footer>
    </article>
  );
}

function PostList({ posts }: { posts: Post[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {posts.map((p) => (
        <li key={p._id}>
          <PostCard post={p} />
        </li>
      ))}
    </ul>
  );
}

function Empty({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <Users aria-hidden className="size-8 text-subtle" strokeWidth={1.5} />
      <p className="font-semibold text-ink">{title}</p>
      <p className="max-w-md text-meta text-subtle">{body}</p>
      {children}
    </div>
  );
}

function Loading() {
  return (
    <div aria-busy className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl border border-line bg-surface-muted/50" />
      ))}
    </div>
  );
}

// ---------- tabs ----------

export function FollowingTab() {
  const data = useQuery(api.circle.following, {});
  if (!data) return <Loading />;
  if (!data.followingCount) {
    return (
      <Empty title={copy.emptyFollowingTitle} body={copy.emptyFollowingBody}>
        <Button asChild size="sm" variant="secondary">
          <Link href="/circle?tab=people">{tabs.people}</Link>
        </Button>
      </Empty>
    );
  }
  if (!data.posts.length) return <Empty title={copy.followingN(data.followingCount)} body={copy.emptyFollowingPosts} />;
  return <PostList posts={data.posts} />;
}

export function TopicsTab() {
  const data = useQuery(api.circle.inMyTopics, {});
  if (!data) return <Loading />;
  return (
    <div className="flex flex-col gap-4">
      {data.topics.length ? (
        <p className="flex flex-wrap items-center gap-2 text-meta text-subtle">
          {copy.yourTopics}:
          {data.topics.map((t) => (
            <TopicChip key={t} topic={t} />
          ))}
        </p>
      ) : null}
      {!data.topics.length ? (
        <Empty title={copy.emptyTopicsTitle} body={copy.emptyTopicsBody}>
          <Button asChild size="sm" variant="secondary">
            <Link href="/settings">{copy.goSettings}</Link>
          </Button>
        </Empty>
      ) : !data.posts.length ? (
        <Empty title={copy.emptyTopicsTitle} body={copy.emptyTopicsPosts} />
      ) : (
        <PostList posts={data.posts} />
      )}
    </div>
  );
}

function PersonCard({ p }: { p: Person }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
      <Link href={`/circle/${p.slug}`} className="shrink-0 rounded-full">
        <Avatar name={p.name} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/circle/${p.slug}`} className="font-semibold text-ink hover:underline">
          {p.name}
        </Link>
        <p className="text-meta text-subtle">
          {copy.followers(p.followerCount)} · {copy.posts(p.postCount)}
        </p>
        {p.bio ? <p className="mt-1 line-clamp-2 text-meta text-copy">{p.bio}</p> : null}
        {p.topics.length ? (
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            {p.topics.map((t) => (
              <span
                key={t}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[0.6875rem] leading-4 font-semibold",
                  p.sharedTopics.includes(t) ? "bg-ecto/30 text-ink" : "bg-surface-muted text-subtle",
                )}
                title={p.sharedTopics.includes(t) ? "You both read about this" : undefined}
              >
                {TOPIC_LABELS[t as Topic] ?? t}
              </span>
            ))}
          </p>
        ) : null}
      </div>
      <FollowButton slug={p.slug} isFollowing={p.isFollowing} />
    </li>
  );
}

export function PeopleTab() {
  const people = useQuery(api.circle.people, {});
  if (!people) return <Loading />;
  if (!people.length) return <Empty title={copy.emptyPeople} body={copy.privateBody} />;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {people.map((p) => (
        <PersonCard key={p.slug} p={p} />
      ))}
    </ul>
  );
}

// ---------- your profile (sidebar) ----------

export function MyProfileCard() {
  const me = useQuery(api.circle.me, {});
  const setProfile = useMutation(api.circle.setProfile);
  const [bio, setBio] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return <div aria-busy className="h-64 animate-pulse rounded-xl bg-surface-muted/60" />;
  const bioValue = bio ?? me.bio ?? "";

  async function save(next: { public: boolean; bio?: string }) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await setProfile(next);
      if (next.bio !== undefined) setNote(copy.saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-ink">{copy.profileTitle}</h2>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase",
            me.profilePublic ? "bg-ecto/30 text-ink" : "bg-surface-muted text-subtle",
          )}
        >
          {me.profilePublic ? <Globe aria-hidden className="size-3" /> : <Lock aria-hidden className="size-3" />}
          {me.profilePublic ? copy.publicNow : copy.privateNow}
        </span>
      </div>
      <p className="text-meta text-copy">{me.profilePublic ? copy.publicBody : copy.privateBody}</p>
      <p className="text-meta text-subtle">
        {copy.followers(me.followerCount)} · {copy.followingN(me.followingCount)} · {copy.posts(me.sharedCount)}
      </p>

      {!me.displayName ? (
        <Notice>
          {copy.needName}{" "}
          <Link href="/settings#profile" className="font-semibold underline">
            {copy.addName}
          </Link>
        </Notice>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-meta font-semibold text-ink">{copy.bioLabel}</span>
        <Textarea value={bioValue} maxLength={160} onChange={(e) => setBio(e.target.value)} placeholder={copy.bioPlaceholder} className="min-h-20" />
        <span className="flex items-center justify-between text-[0.75rem] text-subtle">
          <span>{bioValue.length}/160</span>
          {bio !== null && bio !== (me.bio ?? "") ? (
            <Button size="sm" variant="ghost" onClick={() => void save({ public: me.profilePublic, bio: bioValue })} disabled={busy}>
              {copy.saveBio}
            </Button>
          ) : note ? (
            <span className="text-ecto-ink">{note}</span>
          ) : null}
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={me.profilePublic ? "secondary" : "default"}
          onClick={() => void save({ public: !me.profilePublic })}
          disabled={busy || (!me.profilePublic && !me.displayName)}
        >
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : me.profilePublic ? <Lock aria-hidden /> : <Globe aria-hidden />}
          {me.profilePublic ? copy.turnOff : copy.turnOn}
        </Button>
        {me.slug ? (
          <Button asChild variant="ghost">
            <Link href={`/circle/${me.slug}`}>{copy.viewProfile}</Link>
          </Button>
        ) : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <details className="text-meta text-copy">
        <summary className="cursor-pointer font-semibold text-ink">{copy.howItWorks}</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
          {copy.howBody.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </details>
    </Card>
  );
}

// ---------- a profile page ----------

export function Profile({ slug }: { slug: string }) {
  const p = useQuery(api.circle.profile, { slug });
  if (p === undefined) return <Loading />;
  if (p === null) return <Empty title={copy.profilePrivate} body={copy.emptyFollowingBody} />;
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar name={p.name} className="size-16 text-h3" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[1.75rem] leading-9 font-bold">{p.name}</h1>
          <p className="text-meta text-subtle">
            {copy.followers(p.followerCount)} · {copy.followingN(p.followingCount)} · {copy.posts(p.posts.length)}
          </p>
          {p.bio ? <p className="mt-2 text-copy">{p.bio}</p> : null}
          {p.topics.length ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-meta text-subtle">
              {copy.sharedTopics}:
              {p.topics.map((t) => (
                <TopicChip key={t} topic={t} />
              ))}
            </p>
          ) : null}
        </div>
        {p.isMe ? (
          <Button asChild variant="secondary" size="sm">
            <Link href="/circle?tab=people">
              <Plus aria-hidden /> {tabs.people}
            </Link>
          </Button>
        ) : (
          <FollowButton slug={p.slug} isFollowing={p.isFollowing} size="default" />
        )}
      </Card>
      {p.isMe && !p.isPublic ? <Notice>{copy.yourPreview}</Notice> : null}
      {p.posts.length ? (
        <ul className="flex flex-col gap-3">
          {p.posts.map((post) => (
            <li key={post._id}>
              <PostCard post={post} showFollow={false} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-meta text-subtle">{copy.noPostsYet}</p>
      )}
    </div>
  );
}
