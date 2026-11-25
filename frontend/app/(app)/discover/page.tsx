import { Suspense } from "react";
import type { Metadata } from "next";
import { Discover } from "@/components/covens/Discover";
import { labels } from "@/lib/copy";

// Live, client-gated data (see app/(app)/layout.tsx): opt out of dev-only instant-navigation validation.
export const instant = false;

export const metadata: Metadata = { title: labels.discover.themed };

export default function DiscoverPage() {
  // Discover reads ?c=<slug> with useSearchParams, which needs a Suspense boundary.
  return (
    <main className="flex-1">
      <Suspense>
        <Discover />
      </Suspense>
    </main>
  );
}
