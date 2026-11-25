import type { Metadata } from "next";
import { FogBackground } from "@/components/brand/FogBackground";
import { Docs } from "@/components/docs/Docs";
import { Container } from "@/components/layout/Container";
import { LegalFooter } from "@/components/layout/LegalPage";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { docs } from "@/lib/copy";

export const metadata: Metadata = {
  title: docs.navLabel,
  description: "Connect Kiro, Claude, Cursor, ChatGPT or any MCP client to Necro.",
};

/** Public docs (no sign-in needed): connecting an AI assistant to Necro over MCP. */
export default function DocsPage() {
  return (
    <>
      <FogBackground />
      <SiteHeader />
      <main className="flex-1 py-10 sm:py-14">
        <Container>
          <Docs />
        </Container>
      </main>
      <LegalFooter />
    </>
  );
}
