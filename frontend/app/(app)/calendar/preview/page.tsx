import { Suspense } from "react";
import type { Metadata } from "next";
import { PostPreviewPage } from "@/components/calendar/PostPreviewPage";

// Live, client-gated data (see app/(app)/layout.tsx): opt out of dev-only instant-navigation validation.
export const instant = false;

export const metadata: Metadata = { title: "Post preview" };

export default function PreviewPage() {
  // Reads ?post= with useSearchParams, which needs a Suspense boundary.
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Suspense>
        <PostPreviewPage />
      </Suspense>
    </main>
  );
}
