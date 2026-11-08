"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { ArrowLeft, Search } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { crypt as copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { ItemList, type ItemCard } from "./ItemList";
import { ReadingPane } from "./ReadingPane";

type Filter = "all" | "unread" | "starred";

/** The Crypt: list on the left, reading pane on the right (stacked on phones). URL holds ?grave and ?item. */
export function Crypt() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const graveId = (params.get("grave") || undefined) as Id<"graves"> | undefined;
  const itemId = (params.get("item") || undefined) as Id<"items"> | undefined;

  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"newest" | "relevance">("newest");
  const [term, setTerm] = useState("");

  const graves = useQuery(api.graves.list, {});
  const markAll = useMutation(api.items.markAllRead);
  const page = usePaginatedQuery(api.items.list, { graveId, filter, sort }, { initialNumItems: 30 });
  const results = useQuery(api.items.search, term.trim().length >= 2 ? { query: term, graveId } : "skip");

  const go = useCallback(
    (next: { grave?: string | null; item?: string | null }) => {
      const q = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v) q.set(k, v);
        else q.delete(k);
      }
      router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const items: ItemCard[] | undefined = term.trim().length >= 2 ? results : page.results;
  const loading = items === undefined || (page.status === "LoadingFirstPage" && term.trim().length < 2);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-6 sm:py-10">
      <div className={cn(itemId && "hidden lg:block")}>
        <PageTitle label="crypt" />
      </div>

      <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* List column */}
        <section aria-label="Articles" className={cn("flex min-w-0 flex-col gap-3", itemId && "hidden lg:flex")}>
          <div className="flex flex-col gap-2">
            <select
              aria-label="Feed"
              value={graveId ?? ""}
              onChange={(e) => go({ grave: e.target.value || null, item: null })}
              className="h-10 w-full rounded-md border-[1.5px] border-line bg-surface px-3 text-body text-ink"
            >
              <option value="">{copy.allFeeds}</option>
              {graves?.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.title} {g.unreadCount ? `(${g.unreadCount})` : ""}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <Input
                aria-label={copy.search}
                placeholder={copy.search}
                className="pl-9"
                value={term}
                maxLength={200}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" aria-label="Filter" className="flex rounded-md border border-line p-0.5">
                {(Object.keys(copy.filters) as Filter[]).map((f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded px-3 py-1 text-meta font-semibold",
                      filter === f ? "bg-ecto text-ink" : "text-subtle hover:text-ink",
                    )}
                  >
                    {copy.filters[f]}
                  </button>
                ))}
              </div>
              <select
                aria-label="Sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as "newest" | "relevance")}
                className="h-8 rounded-md border border-line bg-surface px-2 text-meta text-ink"
              >
                <option value="newest">{copy.sortNewest}</option>
                <option value="relevance">{copy.sortRelevance}</option>
              </select>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void markAll({ graveId })}>
                {copy.markAllRead}
              </Button>
            </div>
          </div>

          <ItemList items={items} loading={loading} selected={itemId} onSelect={(id) => go({ item: id })} />

          {term.trim().length < 2 && page.status === "CanLoadMore" ? (
            <Button variant="secondary" onClick={() => page.loadMore(30)}>
              {copy.loadMore}
            </Button>
          ) : null}
        </section>

        {/* Reading column */}
        <section aria-label="Reader" className={cn("min-w-0", !itemId && "hidden lg:block")}>
          {itemId ? (
            <>
              <Button variant="ghost" size="sm" className="mb-3 lg:hidden" onClick={() => go({ item: null })}>
                <ArrowLeft aria-hidden strokeWidth={1.75} /> Back
              </Button>
              <ReadingPane key={itemId} itemId={itemId} />
            </>
          ) : (
            <div className="grid h-full min-h-64 place-items-center rounded-xl border border-dashed border-line text-meta text-subtle">
              {copy.pickOne}
            </div>
          )}
        </section>
      </div>
    </Container>
  );
}
