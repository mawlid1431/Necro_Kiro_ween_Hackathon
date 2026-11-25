import { Suspense } from "react";
import type { Metadata } from "next";
import { Crypt } from "@/components/crypt/Crypt";
import { labels } from "@/lib/copy";

// Live, client-gated data (see app/(app)/layout.tsx): opt out of dev-only instant-navigation validation.
export const instant = false;

export const metadata: Metadata = { title: labels.crypt.themed };

export default function CryptPage() {
  // Crypt reads ?grave= and ?item= with useSearchParams, which needs a Suspense boundary.
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <Crypt />
      </Suspense>
    </main>
  );
}
