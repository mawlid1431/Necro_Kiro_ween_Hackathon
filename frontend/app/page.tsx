import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FogBackground } from "@/components/brand/FogBackground";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { HeroStage } from "@/components/landing/Mockups";
import { SignedInToHome } from "@/components/layout/HomeLink";
import { Audience, Faq, FinalCta, HowItWorks } from "@/components/landing/Sections";
import { Showcase } from "@/components/landing/Showcase";
import { LegalFooter } from "@/components/layout/LegalPage";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/button";
import { landing } from "@/lib/copy";

export default function LandingPage() {
  return (
    <>
      <FogBackground />
      <SignedInToHome />
      <SiteHeader />
      <main className="flex-1">
        <section className="overflow-x-clip py-16 sm:py-24 lg:py-28">
          <Container className="flex flex-col items-center text-center">
            <Logo variant="symbol" className="w-14 animate-float sm:w-16" priority />
            <p className="mt-8 text-overline font-bold text-subtle uppercase">{landing.overline}</p>
            <h1 className="mt-4 max-w-4xl font-display text-[2.5rem] leading-[1.15] font-bold tracking-[0.04em] text-balance sm:text-[3.25rem] lg:text-hero">
              {landing.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-pretty text-copy sm:text-xl">{landing.lead}</p>
            <p className="mt-3 max-w-2xl text-body text-pretty text-subtle">{landing.plain}</p>
            <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button asChild size="lg">
                <Link href="/dashboard">
                  {landing.cta}
                  <ArrowRight aria-hidden strokeWidth={1.75} />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href="#how">{landing.ctaHow}</a>
              </Button>
            </div>
            <HeroStage />
          </Container>
        </section>

        <HowItWorks />

        <Showcase />
        <Audience />
        <Faq />
        <FinalCta />
      </main>
      <LegalFooter />
    </>
  );
}
