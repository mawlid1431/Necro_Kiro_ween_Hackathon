"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { Plus, Rss, Search } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { Button } from "@/components/ui/button";
import { Input, Notice } from "@/components/ui/field";
import { covens as copy, TOPICS, type Topic } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { CollectionCard } from "./CollectionCard";
import { CollectionDialog } from "./CollectionDialog";
import { PublishDialog } from "./PublishDialog";

/** Discover: public collections by topic, the ones you follow, the ones you publish, and the most shared feeds. */
export function Discover() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const open = params.get("c");
  const [topic, setTopic] = useState<Topic | undefined>();
  const [sort, setSort] = useState<"trending" | "new">("trending");
  const [search, setSearch] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const list = useQuery(api.covens.discover, { topic, sort, search: search.trim() || undefined });
  const mine = useQuery(api.covens.mine, {});
  const following = useQuery(api.covens.following, {});

  function show(slug: string | null) {
    router.replace(slug ? `${path}?c=${slug}` : path, { scroll: false });
  }

  const edited = editing ? mine?.find((m) => m.slug === editing) : undefined;

  return (
    <Container className="flex flex-col gap-10 py-8 sm:py-12">
      <div className="flex flex-col gap-3">
        <PageTitle
          label="discover"
          actions={
            <Button onClick={() => setPublishing(true)}>
              <Plus aria-hidden strokeWidth={1.75} /> {copy.publish}
            </Button>
          }
        />
        <p className="max-w-2xl text-copy">{copy.intro}</p>
      </div>

      {following && following.length ? (
        <section aria-labelledby="following-h" className="flex flex-col gap-3">
          <h2 id="following-h" className="font-display text-h3 font-bold">{copy.followingTitle}</h2>
          <ul className="flex flex-wrap gap-2">
            {following.map((f) => (
              <li key={f._id}>
                <button
                  onClick={() => show(f.slug)}
                  className="flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-meta font-semibold text-ink hover:border-ecto-dim"
                >
                  {f.title}
                  <span className={cn("rounded-full px-2 py-0.5 text-overline", f.missing ? "bg-ecto/30 text-ecto-ink" : "bg-surface-muted text-subtle")}>
                    {f.missing ? copy.addNew(f.missing) : copy.upToDate}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="browse-h" className="flex flex-col gap-4">
        <h2 id="browse-h" className="sr-only">{copy.search}</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-80">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input aria-label={copy.search} placeholder={copy.search} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div role="radiogroup" aria-label="Sort" className="flex gap-1 sm:ml-auto">
            {(["trending", "new"] as const).map((s) => (
              <Chip key={s} active={sort === s} onClick={() => setSort(s)}>
                {s === "trending" ? copy.trending : copy.newest}
              </Chip>
            ))}
          </div>
        </div>
        <div role="radiogroup" aria-label="Topic" className="flex flex-wrap gap-1.5">
          <Chip active={!topic} onClick={() => setTopic(undefined)}>{copy.all}</Chip>
          {(Object.keys(TOPICS) as Topic[]).map((t) => (
            <Chip key={t} active={topic === t} onClick={() => setTopic(t)}>{TOPICS[t]}</Chip>
          ))}
        </div>

        {list === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-xl bg-surface-muted/60" />)}
          </div>
        ) : list.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <li key={c._id}>
                <CollectionCard c={c} onOpen={() => show(c.slug)} />
              </li>
            ))}
          </ul>
        ) : (
          <Notice>{copy.empty}</Notice>
        )}
      </section>

      {mine && mine.length ? (
        <section aria-labelledby="mine-h" className="flex flex-col gap-3">
          <h2 id="mine-h" className="font-display text-h3 font-bold">{copy.yours}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((c) => (
              <li key={c._id} className="relative">
                <CollectionCard c={c} onOpen={() => show(c.slug)} />
                <span className="absolute top-5 right-5 text-overline font-bold tracking-[0.12em] text-subtle uppercase">
                  {c.hidden ? copy.status.hidden : copy.status[c.visibility]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TrendingFeeds />

      {open ? <CollectionDialog key={open} slug={open} onClose={() => show(null)} onEdit={(s) => { show(null); setEditing(s); }} /> : null}
      {publishing ? (
        <PublishDialog
          onClose={() => setPublishing(false)}
          onDone={(slug) => {
            setPublishing(false);
            if (slug) show(slug);
          }}
        />
      ) : null}
      {edited ? (
        <PublishDialog
          existing={{
            _id: edited._id,
            title: edited.title,
            description: edited.description,
            topic: edited.topic,
            visibility: edited.visibility,
            starredFeed: edited.starredFeed,
            feedUrls: edited.feeds.map((f) => f.feedUrl),
          }}
          onClose={() => setEditing(null)}
          onDone={() => setEditing(null)}
        />
      ) : null}
    </Container>
  );
}

function Chip({ active, className, ...props }: React.ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={cn(
        "rounded-full border px-3 py-1 text-meta font-semibold transition-colors",
        active ? "border-ecto-dim bg-ecto/25 text-ink" : "border-line text-subtle hover:bg-surface-muted hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

/** Feeds that show up in the most followed collections. One click summons a single feed. */
function TrendingFeeds() {
  const feeds = useQuery(api.covens.trendingFeeds, {});
  const summon = useAction(api.feedsNode.summon);
  const [state, setState] = useState<Record<string, string>>({});
  if (!feeds || !feeds.length) return null;

  async function add(url: string) {
    setState((s) => ({ ...s, [url]: copy.summoning }));
    try {
      const r = await summon({ url });
      setState((s) => ({ ...s, [url]: r.status === "duplicate" ? copy.have : copy.summonedOne }));
    } catch (e) {
      setState((s) => ({ ...s, [url]: errorMessage(e) }));
    }
  }

  return (
    <section aria-labelledby="trending-h" className="flex flex-col gap-3">
      <h2 id="trending-h" className="font-display text-h3 font-bold">{copy.trendingFeeds}</h2>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
        {feeds.map((f) => (
          <li key={f.feedUrl} className="flex items-center gap-3 px-4 py-3">
            <Rss aria-hidden className="size-4 shrink-0 text-ecto-ink" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{f.title}</p>
              <p className="truncate text-meta text-subtle">{f.siteUrl ?? f.feedUrl}</p>
            </div>
            {state[f.feedUrl] ? (
              <span className="max-w-48 shrink-0 truncate text-meta text-subtle">{state[f.feedUrl]}</span>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => void add(f.feedUrl)}>{copy.summonOne}</Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
