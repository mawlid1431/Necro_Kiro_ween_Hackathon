"use client";

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { EmptyGraveyard } from "./EmptyGraveyard";
import { Tombstone } from "./Tombstone";

const gridClass =
  "grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5 3xl:grid-cols-6";

function SkeletonGrid() {
  return (
    <div className={gridClass} aria-busy aria-label="Loading feeds">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="aspect-[4/5] animate-pulse rounded-tomb border border-line bg-surface" />
      ))}
    </div>
  );
}

export function GraveyardGrid() {
  const graves = useQuery(api.graves.list, {});
  if (graves === undefined) return <SkeletonGrid />;
  if (graves.length === 0) return <EmptyGraveyard />;
  return (
    <ul className={gridClass}>
      {graves.map((grave) => (
        <li key={grave._id}>
          <Tombstone title={grave.title} iconUrl={grave.iconUrl} status={grave.status} unread={grave.unreadCount} />
        </li>
      ))}
    </ul>
  );
}
