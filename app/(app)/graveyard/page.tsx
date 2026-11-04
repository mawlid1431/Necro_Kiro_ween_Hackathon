import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { GraveyardGrid } from "@/components/graveyard/GraveyardGrid";
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
            // Summon is built in Phase 2 (spec: summon).
            <Button disabled title={graveyard.summonSoon} className="w-full sm:w-auto">
              <Plus aria-hidden strokeWidth={1.75} />
              {labels.summon.themed}
            </Button>
          }
        />
        <GraveyardGrid />
      </Container>
    </main>
  );
}
