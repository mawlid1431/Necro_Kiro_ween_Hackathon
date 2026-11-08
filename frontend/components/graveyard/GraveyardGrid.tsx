"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  // A tombstone "rises" (lift + glow, once) when its unread count goes up while you watch.
  const seen = useRef(new Map<string, number>());
  const [risen, setRisen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!graves) return;
    const up = new Set<string>();
    for (const g of graves) {
      const before = seen.current.get(g._id);
      if (before !== undefined && g.unreadCount > before) up.add(g._id);
      seen.current.set(g._id, g.unreadCount);
    }
    if (up.size) {
      // State changes happen in timer callbacks, not synchronously in the effect body.
      const on = setTimeout(() => setRisen(up), 0);
      const off = setTimeout(() => setRisen(new Set()), 1500);
      return () => {
        clearTimeout(on);
        clearTimeout(off);
      };
    }
  }, [graves]);

  if (graves === undefined) return <SkeletonGrid />;
  if (graves.length === 0) return <EmptyGraveyard />;
  return (
    <ul className={gridClass}>
      {graves.map((grave) => (
        <li key={grave._id}>
          <Link href={`/crypt?grave=${grave._id}`} className="block rounded-tomb" aria-label={`Read ${grave.title}`}>
            <Tombstone
              title={grave.title}
              iconUrl={grave.iconUrl}
              status={grave.status}
              unread={grave.unreadCount}
              risen={risen.has(grave._id)}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
