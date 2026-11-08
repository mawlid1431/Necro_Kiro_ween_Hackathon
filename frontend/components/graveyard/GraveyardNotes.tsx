"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { graveyard } from "@/lib/copy";

/** Small live notes above the grid: what rose today, and a nudge to set interests. */
export function GraveyardNotes() {
  const risen = useQuery(api.items.risenToday);
  const me = useQuery(api.users.me);
  if (risen === undefined || me === undefined) return null;
  return (
    <div className="flex flex-col gap-3">
      {me && me.interests.length === 0 ? (
        <p className="rounded-lg border border-highlight/40 bg-highlight/10 px-4 py-3 text-meta text-copy">
          {graveyard.noInterests}{" "}
          <Link href="/settings" className="font-semibold text-ecto-ink underline-offset-4 hover:underline">
            Set interests
          </Link>
        </p>
      ) : null}
      {risen > 0 ? <p className="text-meta font-semibold text-ecto-ink">{graveyard.risenToday(risen)}</p> : null}
    </div>
  );
}
