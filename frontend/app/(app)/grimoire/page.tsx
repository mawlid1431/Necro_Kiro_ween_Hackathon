import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { Grimoire } from "@/components/grimoire/Grimoire";
import { labels } from "@/lib/copy";

export const metadata: Metadata = { title: labels.grimoire.themed };

export default function GrimoirePage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex flex-col gap-8">
        <PageTitle label="grimoire" />
        <Grimoire />
      </Container>
    </main>
  );
}
