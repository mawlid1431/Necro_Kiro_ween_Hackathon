import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { ProfileFromUrl } from "@/components/circle/ProfileFromUrl";
import { labels } from "@/lib/copy";

// Live, client-gated data (see app/(app)/layout.tsx): opt out of dev-only instant-navigation validation.
export const instant = false;

export const metadata: Metadata = { title: labels.circle.themed };

/** A person's Circle profile. The slug is read on the client, so the page shell never waits on the URL. */
export default function CircleProfilePage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex max-w-3xl flex-col gap-6 3xl:max-w-4xl">
        <ProfileFromUrl />
      </Container>
    </main>
  );
}
