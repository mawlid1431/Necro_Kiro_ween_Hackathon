import type { ReactNode } from "react";
import { Check, Clock, Sparkles } from "lucide-react";
import { PlatformIcon } from "@/components/brand/PlatformIcon";
import { cn } from "@/lib/utils";

// Device mockups for the landing page, drawn in code from Necro's real screens (no screenshots to keep in sync).
// Decorative: every mockup is aria-hidden; the surrounding text says what it shows.

/** A phone frame. `tilt` leans it for the hero. */
export function Phone({ children, className, tilt = false }: { children: ReactNode; className?: string; tilt?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative w-[15.5rem] shrink-0 rounded-[2.6rem] bg-midnight p-2.5 shadow-[0_30px_60px_-20px_rgb(13_10_20/0.45)] ring-1 ring-grave sm:w-[17rem]",
        tilt && "lg:-rotate-6",
        className,
      )}
    >
      <div className="relative aspect-[9/19] overflow-hidden rounded-[2.1rem] bg-page">
        <div className="absolute top-2 left-1/2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-midnight" />
        <div className="flex h-full flex-col pt-9 text-left">{children}</div>
      </div>
    </div>
  );
}

function ScreenHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-4 pb-2">
      <p className="font-display text-[1.05rem] leading-6 font-bold text-ink">{title}</p>
      <p className="text-[0.625rem] text-subtle">{sub}</p>
    </div>
  );
}

/** The Crypt with a Séance: the core reading moment. */
export function CryptScreen() {
  return (
    <>
      <ScreenHeader title="The Crypt" sub="Reader" />
      <div className="flex flex-col gap-1.5 px-3">
        {[
          ["Why small teams ship faster", "Simon Willison", true],
          ["The quiet return of RSS", "The Verge", false],
        ].map(([t, s, unread]) => (
          <div key={t as string} className="rounded-lg border border-line bg-surface px-2.5 py-1.5">
            <p className="flex items-center gap-1 text-[0.6875rem] leading-4 font-semibold text-ink">
              {unread ? <span className="size-1.5 shrink-0 rounded-full bg-ecto-dim" /> : null}
              {t}
            </p>
            <p className="text-[0.5625rem] text-subtle">{s} · 2h ago</p>
          </div>
        ))}
      </div>
      <div className="mx-3 mt-2 rounded-xl border border-line bg-surface-muted p-2.5">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-[0.6875rem] font-bold text-ink">
            <Sparkles className="size-3 text-ecto-ink" /> Séance
          </p>
          <span className="rounded-full bg-ecto/30 px-1.5 text-[0.5625rem] font-bold text-ecto-ink">82</span>
        </div>
        <ul className="mt-1.5 flex flex-col gap-1 text-[0.5625rem] leading-3.5 text-copy">
          <li>• Small teams cut handoffs and decide in hours.</li>
          <li>• Fewer meetings, more written context.</li>
          <li>• Ship small, learn, repeat.</li>
        </ul>
      </div>
      <div className="mx-3 mt-auto mb-3 flex gap-1.5">
        <span className="flex-1 rounded-md bg-ecto py-1.5 text-center text-[0.625rem] font-bold text-on-ecto">Resurrect</span>
        <span className="flex-1 rounded-md border border-line py-1.5 text-center text-[0.625rem] font-semibold text-ink">Listen</span>
      </div>
    </>
  );
}

/** Resurrect: a post in your voice, previewed as it will appear, ready to post or schedule. */
export function ResurrectScreen() {
  return (
    <>
      <ScreenHeader title="Resurrect" sub="Posts in your voice" />
      <div className="mx-3 flex gap-1 border-b border-line pb-1.5">
        {(["linkedin", "x", "instagram", "tiktok"] as const).map((p, i) => (
          <span key={p} className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.5rem] font-semibold", i === 0 ? "bg-surface-muted text-ink" : "text-subtle")}>
            <PlatformIcon platform={p} brand={i === 0} className="size-2.5" />
          </span>
        ))}
      </div>
      <div className="mx-3 mt-2 rounded-lg border border-line bg-surface p-2">
        <div className="flex items-center gap-1.5">
          <span className="size-5 rounded-full bg-ecto/50" />
          <div>
            <p className="text-[0.5625rem] font-semibold text-ink">You</p>
            <p className="text-[0.5rem] text-subtle">Now · 🌐</p>
          </div>
        </div>
        <p className="mt-1.5 text-[0.5625rem] leading-3.5 text-copy">Small teams ship faster because every decision is one conversation away. Three lessons I took from this…</p>
        <div className="mt-1.5 overflow-hidden rounded border border-line">
          <div className="h-12 bg-gradient-to-br from-crypt via-grave to-ecto-dim" />
          <p className="bg-surface-muted px-1.5 py-1 text-[0.5rem] font-semibold text-ink">Why small teams ship faster</p>
        </div>
      </div>
      <div className="mx-3 mt-auto mb-3 flex flex-col gap-1.5">
        <span className="rounded-md bg-ecto py-1.5 text-center text-[0.625rem] font-bold text-on-ecto">Post now to LinkedIn</span>
        <span className="rounded-md border border-line py-1.5 text-center text-[0.625rem] font-semibold text-ink">Schedule for later</span>
      </div>
    </>
  );
}

/** Witching Hour: the calendar of scheduled and published posts. */
export function CalendarScreen() {
  const marks: Record<number, "posted" | "scheduled" | "due"> = { 3: "posted", 6: "posted", 10: "scheduled", 12: "due", 17: "scheduled", 24: "scheduled" };
  return (
    <>
      <ScreenHeader title="Witching Hour" sub="Calendar and live timeline" />
      <div className="mx-3 rounded-lg border border-line bg-surface p-1.5">
        <div className="grid grid-cols-7 gap-0.5 text-center text-[0.5rem] text-subtle">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <span
              key={d}
              className={cn(
                "rounded py-0.5 text-[0.5rem]",
                marks[d] === "posted" && "bg-ecto/25 font-bold text-ecto-ink",
                marks[d] === "scheduled" && "bg-surface-muted font-bold text-ink",
                marks[d] === "due" && "bg-candle/30 font-bold text-ink",
                d === 12 && "ring-1 ring-candle",
              )}
            >
              {d}
            </span>
          ))}
        </div>
      </div>
      <p className="mx-3 mt-2 text-[0.625rem] font-bold text-ink">Up next</p>
      <div className="mx-3 mt-1 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 rounded-md border border-candle bg-candle/10 px-2 py-1">
          <PlatformIcon platform="instagram" brand className="size-3" />
          <span className="text-[0.5625rem] font-semibold text-ink">Time to post</span>
          <span className="ml-auto text-[0.5rem] text-subtle">now</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1">
          <PlatformIcon platform="linkedin" brand className="size-3" />
          <span className="text-[0.5625rem] font-semibold text-ink">Posts automatically</span>
          <span className="ml-auto text-[0.5rem] text-subtle">Fri 09:00</span>
        </div>
      </div>
    </>
  );
}

/** A small floating status card around the hero phone (decorative). */
export function FloatCard({ icon, title, sub, className, delay = "0s" }: { icon: ReactNode; title: string; sub: string; className?: string; delay?: string }) {
  return (
    <div
      aria-hidden
      style={{ animationDelay: delay }}
      className={cn(
        "absolute z-20 flex items-center gap-2.5 rounded-xl border border-line bg-surface/95 px-3 py-2 text-left shadow-lg backdrop-blur-sm animate-float motion-reduce:animate-none",
        className,
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-muted">{icon}</span>
      <span>
        <span className="block text-meta font-semibold whitespace-nowrap text-ink">{title}</span>
        <span className="block text-[0.6875rem] whitespace-nowrap text-subtle">{sub}</span>
      </span>
    </div>
  );
}

/** The hero stage: the reading moment on a phone, with what Necro does floating around it. */
export function HeroStage() {
  return (
    <div className="relative mx-auto mt-14 flex w-full max-w-3xl justify-center pb-6 sm:mt-16">
      <div aria-hidden className="absolute inset-x-8 top-10 bottom-0 -z-10 rounded-[3rem] bg-gradient-to-br from-ecto/30 via-violet-haze to-candle/20 blur-2xl" />
      <Phone tilt>
        <CryptScreen />
      </Phone>
      <FloatCard
        className="top-10 left-0 hidden sm:flex lg:-left-6"
        icon={<span className="size-2.5 rounded-full bg-ecto-dim shadow-glow" />}
        title="A new post rose"
        sub="Simon Willison · just now"
      />
      <FloatCard
        className="top-1/2 right-0 hidden sm:flex lg:-right-8"
        delay="1.2s"
        icon={<Sparkles className="size-4 text-ecto-ink" />}
        title="Séance: relevance 82"
        sub="3 key points, ready"
      />
      <FloatCard
        className="bottom-16 left-2 hidden md:flex lg:-left-10"
        delay="2.4s"
        icon={<PlatformIcon platform="linkedin" brand className="size-5" />}
        title="Posted to LinkedIn"
        sub="Exactly as previewed"
      />
      <FloatCard
        className="right-6 bottom-2 flex sm:hidden"
        delay="0.6s"
        icon={<Check className="size-4 text-ecto-ink" />}
        title="Read, summarise, share"
        sub="All in one place"
      />
      <FloatCard
        className="right-4 bottom-4 hidden lg:flex"
        delay="3s"
        icon={<Clock className="size-4 text-candle" />}
        title="Scheduled"
        sub="Fri 09:00 · Witching Hour"
      />
    </div>
  );
}
