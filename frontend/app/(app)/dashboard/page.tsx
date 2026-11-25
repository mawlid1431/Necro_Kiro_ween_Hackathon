import type { Metadata } from "next";
import { Overview } from "@/components/home/Overview";
import { Container } from "@/components/layout/Container";
import { labels } from "@/lib/copy";

// Live, client-gated data (see app/(app)/layout.tsx): opt out of dev-only instant-navigation validation.
export const instant = false;

export const metadata: Metadata = { title: labels.home.themed };

export default function DashboardPage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container>
        <Overview />
      </Container>
    </main>
  );
}
