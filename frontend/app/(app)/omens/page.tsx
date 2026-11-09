import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { Omens } from "@/components/omens/Omens";
import { labels } from "@/lib/copy";

export const metadata: Metadata = { title: labels.omens.themed };

export default function OmensPage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex flex-col gap-8">
        <PageTitle label="omens" />
        <Omens />
      </Container>
    </main>
  );
}
