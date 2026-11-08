import { Suspense } from "react";
import type { Metadata } from "next";
import { Crypt } from "@/components/crypt/Crypt";
import { labels } from "@/lib/copy";

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
