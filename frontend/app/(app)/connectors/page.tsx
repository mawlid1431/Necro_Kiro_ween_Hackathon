import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { ConnectorsPanel } from "@/components/connectors/ConnectorsPanel";
import { labels } from "@/lib/copy";

export const metadata: Metadata = { title: labels.connectors.themed };

export default function ConnectorsPage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex flex-col gap-6">
        <PageTitle label="connectors" />
        <ConnectorsPanel />
      </Container>
    </main>
  );
}
