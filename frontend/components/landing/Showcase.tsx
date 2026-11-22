import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { landing } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { CalendarScreen, Phone, ResurrectScreen } from "./Mockups";

const screens: Record<string, ReactNode> = {
  resurrect: <ResurrectScreen />,
  calendar: <CalendarScreen />,
};

const panels = [
  "from-ecto/35 via-bone to-violet-haze",
  "from-violet-haze via-bone to-ecto/30",
  "from-candle/25 via-bone to-ecto/25",
];

/** "See it in action": each step of the loop, a short promise and the real screen on a phone. */
export function Showcase() {
  return (
    <section aria-labelledby="showcase-title" className="pb-20 sm:pb-28">
      <Container className="flex flex-col gap-14 sm:gap-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-overline font-bold text-subtle uppercase">{landing.showcase.overline}</p>
          <h2 id="showcase-title" className="mt-3 font-display text-[1.75rem] leading-9 font-bold text-balance sm:text-h1">
            {landing.showcase.title}
          </h2>
          <p className="mt-3 text-copy">{landing.showcase.lead}</p>
        </div>

        {landing.showcase.rows.map((row, i) => (
          <div key={row.key} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <div className={cn("flex flex-col gap-4", i % 2 === 1 && "lg:order-2")}>
              <p className="text-overline font-bold text-ecto-ink uppercase">{row.step}</p>
              <h3 className="font-display text-h2 font-bold text-balance sm:text-[1.75rem] sm:leading-9">{row.title}</h3>
              <p className="text-copy">{row.body}</p>
              <ul className="flex flex-col gap-2">
                {row.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-copy">
                    <Check aria-hidden className="mt-1 size-4 shrink-0 text-ecto-ink" strokeWidth={2.25} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className={cn("relative flex justify-center overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br px-6 pt-10", panels[i % panels.length], i % 2 === 1 && "lg:order-1")}>
              <Phone className="translate-y-6">{screens[row.key]}</Phone>
            </div>
          </div>
        ))}
      </Container>
    </section>
  );
}
