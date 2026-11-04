import Link from "next/link";
import { ArrowRight, Ghost, Rss, Sparkles } from "lucide-react";
import { FogBackground } from "@/components/brand/FogBackground";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/button";
import { labels, landing, site } from "@/lib/copy";

const featureIcons = { summon: Rss, seance: Sparkles, resurrect: Ghost } as const;

export default function LandingPage() {
  return (
    <>
      <FogBackground />
      <SiteHeader />
      <main className="flex-1">
        <section className="py-16 sm:py-24 lg:py-32">
          <Container className="flex flex-col items-center text-center">
            <Logo variant="symbol" className="w-14 animate-float sm:w-16" priority />
            <p className="mt-8 text-overline font-bold text-subtle uppercase">{landing.overline}</p>
            <h1 className="mt-4 max-w-4xl font-display text-[2.5rem] leading-[1.15] font-bold tracking-[0.04em] text-balance sm:text-[3.25rem] lg:text-hero">
              {landing.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-pretty text-copy sm:text-xl">{landing.lead}</p>
            <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg">
                <Link href="/graveyard">
                  {landing.cta}
                  <ArrowRight aria-hidden strokeWidth={1.75} />
                </Link>
              </Button>
            </div>
          </Container>
        </section>

        <section aria-labelledby="features-title" className="pb-20 sm:pb-28">
          <Container>
            <h2 id="features-title" className="sr-only">
              Features
            </h2>
            <ul className="grid gap-4 sm:gap-6 md:grid-cols-3">
              {landing.features.map(({ key, body }) => {
                const Icon = featureIcons[key as keyof typeof featureIcons];
                return (
                  <li key={key} className="rounded-2xl border border-line bg-surface p-6 lg:p-8">
                    <Icon aria-hidden className="size-5 text-ecto-ink" strokeWidth={1.75} />
                    <h3 className="mt-4 text-h3 font-semibold">{labels[key].themed}</h3>
                    <p className="text-meta font-medium text-subtle">{labels[key].plain}</p>
                    <p className="mt-3 text-copy">{body}</p>
                  </li>
                );
              })}
            </ul>
          </Container>
        </section>
      </main>
      <footer className="border-t border-line/60 py-6">
        <Container className="flex flex-col items-center justify-between gap-2 text-meta text-subtle sm:flex-row">
          <span>{site.tagline}</span>
          <span>MIT licensed · Built with Kiro</span>
        </Container>
      </footer>
    </>
  );
}
