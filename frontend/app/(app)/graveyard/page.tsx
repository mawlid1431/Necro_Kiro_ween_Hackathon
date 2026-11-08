import type { Metadata } from "next";
import { GraveyardGrid } from "@/components/graveyard/GraveyardGrid";
import { GraveyardNotes } from "@/components/graveyard/GraveyardNotes";
import { SummonDialog } from "@/components/graveyard/SummonDialog";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { labels } from "@/lib/copy";

export const metadata: Metadata = { title: labels.graveyard.themed };

export default function GraveyardPage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex flex-col gap-8">
        <PageTitle label="graveyard" actions={<SummonDialog />} />
        <GraveyardNotes />
        <GraveyardGrid />
      </Container>
    </main>
  );
}
