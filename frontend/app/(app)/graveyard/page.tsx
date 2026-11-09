import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { GraveyardGrid } from "@/components/graveyard/GraveyardGrid";
import { GraveyardNotes } from "@/components/graveyard/GraveyardNotes";
import { MineSection } from "@/components/graveyard/MineSection";
import { SummonDialog } from "@/components/graveyard/SummonDialog";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { Button } from "@/components/ui/button";
import { graveyard, labels } from "@/lib/copy";

export const metadata: Metadata = { title: labels.graveyard.themed };

export default function GraveyardPage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex flex-col gap-8">
        <PageTitle
          label="graveyard"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/discover">
                  <Compass aria-hidden strokeWidth={1.75} /> {graveyard.findFeeds}
                </Link>
              </Button>
              <SummonDialog />
            </div>
          }
        />
        <GraveyardNotes />
        <GraveyardGrid />
        <MineSection />
      </Container>
    </main>
  );
}
