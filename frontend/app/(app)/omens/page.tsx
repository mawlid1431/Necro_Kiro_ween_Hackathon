import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { PageTitle } from "@/components/layout/PageTitle";
import { Grimoire } from "@/components/grimoire/Grimoire";
import { PageTabs } from "@/components/layout/PageTabs";
import { Omens } from "@/components/omens/Omens";
import { labels, tabs } from "@/lib/copy";

// Live, client-gated data (see app/(app)/layout.tsx): opt out of dev-only instant-navigation validation.
export const instant = false;

export const metadata: Metadata = { title: labels.omens.themed };

export default function OmensPage() {
  return (
    <main className="flex-1 py-8 sm:py-12">
      <Container className="flex flex-col gap-8">
        <PageTitle label="omens" />
        <PageTabs
          label={labels.omens.plain}
          tabs={[
            { key: "alerts", label: tabs.omens, content: <Omens /> },
            { key: "grimoire", label: tabs.grimoire, content: <Grimoire /> },
          ]}
        />
      </Container>
    </main>
  );
}
