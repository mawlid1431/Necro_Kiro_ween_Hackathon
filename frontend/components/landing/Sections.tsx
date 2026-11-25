import Link from "next/link";
import { ArrowRight, BookOpen, Bot, GraduationCap, Megaphone, Rocket, Rss, Send, Sparkles } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { Button } from "@/components/ui/button";
import { labels, landing } from "@/lib/copy";

// Landing sections in plain words: how it works, who it is for, honest answers, one clear next step.

const stepIcons = [Rss, Sparkles, Send, Bot];

/** How it works: four numbered steps a first-time visitor understands in seconds. */
export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 pb-20 sm:pb-28">
      <Container className="flex flex-col gap-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-overline font-bold text-subtle uppercase">{landing.how.overline}</p>
          <h2 id="how-title" className="mt-3 font-display text-[1.75rem] leading-9 font-bold text-balance sm:text-h1">
            {landing.how.title}
          </h2>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
          {landing.how.steps.map((s, i) => {
            const Icon = stepIcons[i];
            return (
              <li key={s.key} className="relative rounded-2xl border border-line bg-surface p-6 shadow-[var(--card-shadow)]">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-ecto font-display text-body font-bold text-on-ecto">{i + 1}</span>
                  <Icon aria-hidden className="size-5 text-ecto-ink" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-h3 font-semibold">{s.title}</h3>
                <p className="text-meta font-medium text-subtle">
                  {labels[s.key].themed} · {labels[s.key].plain}
                </p>
                <p className="mt-3 text-copy">{s.body}</p>
                {s.key === "mcp" ? (
                  <Link href="/docs" className="mt-3 inline-flex items-center gap-1 text-meta font-semibold text-ecto-ink hover:underline">
                    {landing.how.docsLink} <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}

const audienceIcons = [Megaphone, GraduationCap, Rocket, BookOpen];

/** Who it is for: so visitors recognise themselves. */
export function Audience() {
  return (
    <section aria-labelledby="who-title" className="pb-20 sm:pb-28">
      <Container className="flex flex-col gap-8">
        <h2 id="who-title" className="text-center font-display text-[1.75rem] leading-9 font-bold text-balance sm:text-h1">
          {landing.who.title}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {landing.who.people.map((p, i) => {
            const Icon = audienceIcons[i];
            return (
              <li key={p.title} className="rounded-2xl border border-line bg-surface p-5">
                <Icon aria-hidden className="size-5 text-ecto-ink" strokeWidth={1.75} />
                <h3 className="mt-3 text-body font-semibold text-ink">{p.title}</h3>
                <p className="mt-1 text-meta text-copy">{p.body}</p>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

/** Honest short answers to what people wonder before signing up (native, keyboard-friendly accordion). */
export function Faq() {
  return (
    <section aria-labelledby="faq-title" className="pb-20 sm:pb-28">
      <Container className="max-w-3xl">
        <h2 id="faq-title" className="text-center font-display text-[1.75rem] leading-9 font-bold sm:text-h1">
          {landing.faq.title}
        </h2>
        <div className="mt-8 flex flex-col gap-2">
          {landing.faq.items.map((q) => (
            <details key={q.q} className="group rounded-xl border border-line bg-surface px-5 py-4 open:bg-surface-muted/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-body font-semibold text-ink">
                {q.q}
                <span aria-hidden className="text-subtle transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-copy">{q.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/** One clear next step at the end of the page. */
export function FinalCta() {
  return (
    <section className="pb-20 sm:pb-28">
      <Container>
        <div className="flex flex-col items-center gap-5 rounded-[2rem] border border-line bg-gradient-to-br from-ecto/30 via-surface-muted to-violet-haze px-6 py-12 text-center sm:py-16">
          <h2 className="max-w-2xl font-display text-[1.75rem] leading-9 font-bold text-balance sm:text-h1">{landing.final.title}</h2>
          <p className="max-w-xl text-copy">{landing.final.body}</p>
          <Button asChild size="lg">
            <Link href="/dashboard">
              {landing.final.cta}
              <ArrowRight aria-hidden strokeWidth={1.75} />
            </Link>
          </Button>
          <p className="text-meta text-subtle">{landing.final.note}</p>
        </div>
      </Container>
    </section>
  );
}
