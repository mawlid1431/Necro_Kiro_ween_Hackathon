"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { BookOpen, Eye, EyeOff, Globe, Pencil, Plus, Rss, Trash2, Users } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { PublishDialog } from "@/components/covens/PublishDialog";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input, Notice } from "@/components/ui/field";
import { covens as ccopy, doctorCopy, mine as copy, TOPICS, type Topic } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Tab = "feeds" | "collections";

/** "Mine": manage your own feeds and the collections you published, in one place. */
export function MineSection() {
  const [tab, setTab] = useState<Tab>("feeds");
  const graves = useQuery(api.graves.list, {});
  const mine = useQuery(api.covens.mine, {});
  return (
    <section aria-labelledby="mine-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="mine-h" className="font-display text-h2 font-bold">{copy.title}</h2>
          <p className="text-meta text-subtle">{copy.subtitle}</p>
        </div>
        <div role="tablist" aria-label={copy.title} className="flex gap-1 rounded-lg bg-surface-muted p-1">
          {(["feeds", "collections"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("rounded-md px-3 py-1.5 text-meta font-semibold transition-colors", tab === t ? "bg-surface text-ink shadow-sm" : "text-subtle hover:text-ink")}
            >
              {t === "feeds" ? copy.feedsTab(graves?.length ?? 0) : copy.collectionsTab(mine?.length ?? 0)}
            </button>
          ))}
        </div>
      </div>
      {tab === "feeds" ? <FeedsManager graves={graves} /> : <CollectionsManager mine={mine} />}
    </section>
  );
}

type Grave = NonNullable<ReturnType<typeof useQuery<typeof api.graves.list>>>[number];

function FeedsManager({ graves }: { graves: Grave[] | undefined }) {
  if (graves === undefined) return <div className="h-40 animate-pulse rounded-xl bg-surface-muted/60" />;
  if (!graves.length) return <Notice>{copy.noFeeds}</Notice>;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
      {graves.map((g) => (
        <FeedRow key={g._id} g={g} />
      ))}
    </ul>
  );
}

const STATUS_TONE: Record<string, string> = { alive: "text-ecto-ink", dormant: "text-subtle", broken: "text-danger" };

function FeedRow({ g }: { g: Grave }) {
  const rename = useMutation(api.graves.rename);
  const moveToFolder = useMutation(api.graves.moveToFolder);
  const bury = useMutation(api.graves.layToRest);
  const { confirm } = useConfirm();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(g.title);
  const [folder, setFolder] = useState(g.folder ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (title.trim() !== g.title) await rename({ graveId: g._id, title });
      if ((folder.trim() || undefined) !== g.folder) await moveToFolder({ graveId: g._id, folder: folder.trim() || undefined });
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <li className="px-4 py-3">
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input aria-label={copy.feedName} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="sm:flex-1" />
          <Input aria-label={copy.folder} value={folder} maxLength={60} placeholder={copy.folderPlaceholder} onChange={(e) => setFolder(e.target.value)} className="sm:w-48" />
          <div className="flex gap-2">
            <Button type="submit" size="sm">{copy.save}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => (setEditing(false), setTitle(g.title), setFolder(g.folder ?? ""))}>
              {copy.cancel}
            </Button>
          </div>
          {error ? <p className="text-meta text-danger">{error}</p> : null}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted font-display font-bold text-copy">
            {(g.title.match(/[\p{L}\p{N}]/u)?.[0] ?? "N").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{g.title}</p>
            <p className="truncate text-meta text-subtle">
              <span className={STATUS_TONE[g.status] ?? "text-subtle"}>{copy.status[g.status as keyof typeof copy.status] ?? g.status}</span>
              {g.folder ? ` · ${g.folder}` : ""}
              {g.unreadCount ? ` · ${copy.unread(g.unreadCount)}` : ""}
              {" · "}
              {g.siteUrl ?? g.feedUrl}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button asChild size="sm" variant="secondary">
              <Link href={`/crypt?grave=${g._id}`}>
                <BookOpen aria-hidden strokeWidth={1.75} /> {copy.read}
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil aria-hidden strokeWidth={1.75} /> {copy.edit}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              aria-label={`${doctorCopy.bury}: ${g.title}`}
              onClick={async () => {
                if (await confirm({ title: doctorCopy.buryTitle, body: doctorCopy.buryBody(g.title), confirmLabel: doctorCopy.bury, tone: "danger" })) await bury({ graveId: g._id });
              }}
            >
              <Trash2 aria-hidden strokeWidth={1.75} />
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

type MineCollection = NonNullable<ReturnType<typeof useQuery<typeof api.covens.mine>>>[number];

function CollectionsManager({ mine }: { mine: MineCollection[] | undefined }) {
  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState<MineCollection | null>(null);
  if (mine === undefined) return <div className="h-40 animate-pulse rounded-xl bg-surface-muted/60" />;
  return (
    <div className="flex flex-col gap-3">
      {mine.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {mine.map((c) => (
            <CollectionRow key={c._id} c={c} onEdit={() => setEditing(c)} />
          ))}
        </ul>
      ) : (
        <Notice>{copy.noCollections}</Notice>
      )}
      <Button variant="secondary" className="self-start" onClick={() => setPublishing(true)}>
        <Plus aria-hidden strokeWidth={1.75} /> {ccopy.publish}
      </Button>
      {publishing ? <PublishDialog onClose={() => setPublishing(false)} onDone={() => setPublishing(false)} /> : null}
      {editing ? (
        <PublishDialog
          existing={{
            _id: editing._id,
            title: editing.title,
            description: editing.description,
            topic: editing.topic,
            visibility: editing.visibility,
            starredFeed: editing.starredFeed,
            feedUrls: editing.feeds.map((f) => f.feedUrl),
          }}
          onClose={() => setEditing(null)}
          onDone={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function CollectionRow({ c, onEdit }: { c: MineCollection; onEdit: () => void }) {
  const update = useMutation(api.covens.update);
  const remove = useMutation(api.covens.remove);
  const { confirm } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const isPublic = c.visibility === "public";

  async function toggleVisibility() {
    setError(null);
    try {
      await update({ collectionId: c._id as Id<"collections">, visibility: isPublic ? "unlisted" : "public" });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", isPublic && !c.hidden ? "bg-ecto/30 text-ecto-ink" : "bg-surface-muted text-subtle")}>
          {isPublic ? <Globe aria-hidden className="size-4" strokeWidth={1.75} /> : <EyeOff aria-hidden className="size-4" strokeWidth={1.75} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{c.title}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-meta text-subtle">
            <span className={cn("font-semibold", c.hidden ? "text-danger" : isPublic ? "text-ecto-ink" : "text-subtle")}>
              {c.hidden ? copy.hidden : isPublic ? copy.public : copy.private}
            </span>
            <span>· {TOPICS[c.topic as Topic]}</span>
            <span className="flex items-center gap-1">
              · <Rss aria-hidden className="size-3" /> {ccopy.feeds(c.feedCount)}
            </span>
            <span className="flex items-center gap-1">
              · <Users aria-hidden className="size-3" /> {ccopy.followers(c.followerCount)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/discover?c=${c.slug}`}>
              <Eye aria-hidden strokeWidth={1.75} /> {copy.view}
            </Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil aria-hidden strokeWidth={1.75} /> {copy.edit}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void toggleVisibility()} title={isPublic ? copy.makePrivateHint : copy.makePublicHint}>
            {isPublic ? <EyeOff aria-hidden strokeWidth={1.75} /> : <Globe aria-hidden strokeWidth={1.75} />}
            {isPublic ? copy.makePrivate : copy.makePublic}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={async () => {
              if (await confirm({ title: copy.unpublishTitle, body: ccopy.deleteConfirm(c.title), confirmLabel: copy.unpublish, tone: "danger" })) {
                await remove({ collectionId: c._id as Id<"collections"> });
              }
            }}
          >
            <Trash2 aria-hidden strokeWidth={1.75} /> {copy.unpublish}
          </Button>
        </div>
      </div>
      {c.hidden ? <p className="text-meta text-danger">{ccopy.hiddenNote}</p> : null}
      {error ? <p className="text-meta text-danger">{error}</p> : null}
    </li>
  );
}
