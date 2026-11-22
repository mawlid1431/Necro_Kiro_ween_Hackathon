import type { ReactNode } from "react";
import Link from "next/link";
import { FogBackground } from "@/components/brand/FogBackground";
import { Container } from "@/components/layout/Container";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { site } from "@/lib/copy";

/** Shared shell for the public Privacy and Terms pages (no sign-in needed). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <FogBackground />
      <SiteHeader />
      <main className="flex-1 py-10 sm:py-16">
        <Container className="max-w-3xl">
          <h1 className="font-display text-[1.75rem] leading-9 font-bold sm:text-h1">{title}</h1>
          <p className="mt-1 text-meta text-subtle">Last updated {updated}</p>
          <div className="mt-8 flex flex-col gap-6 text-body leading-7 text-copy [&_a]:font-semibold [&_a]:text-ecto-ink [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-h3 [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-6">
            {children}
          </div>
        </Container>
      </main>
      <LegalFooter />
    </>
  );
}

export function LegalFooter() {
  return (
    <footer className="border-t border-line/60 py-6">
      <Container className="flex flex-col items-center justify-between gap-2 text-meta text-subtle sm:flex-row">
        <span>{site.tagline}</span>
        <span className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <span>MIT licensed · Built with Kiro</span>
        </span>
      </Container>
    </footer>
  );
}
