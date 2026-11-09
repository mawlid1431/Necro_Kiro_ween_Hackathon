"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Sparkles } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Notice, Textarea } from "@/components/ui/field";
import { settings as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const list = (s: string) => s.split(",").map((w) => w.trim()).filter(Boolean);
type Voice = FunctionReturnType<typeof api.voice.get>;

/** Voice profile used by Resurrect (and Grimoire): presets, plain guidance and a live summary. */
export function VoiceForm() {
  const voice = useQuery(api.voice.get);
  return (
    <Card aria-labelledby="voice-h">
      <h2 id="voice-h" className="font-display text-h3 font-bold">{copy.voice}</h2>
      <p className="mt-1 max-w-2xl text-meta text-copy">{copy.voiceIntro}</p>
      {/* undefined = loading; null = no profile yet (empty form). */}
      {voice === undefined ? <div className="mt-4 h-64 animate-pulse rounded-lg bg-surface-muted/60" /> : <Form voice={voice} />}
    </Card>
  );
}

function Form({ voice }: { voice: Voice }) {
  const save = useMutation(api.voice.save);
  const [tone, setTone] = useState(voice?.tone ?? "");
  const [audience, setAudience] = useState(voice?.audience ?? "");
  const [use, setUse] = useState(voice?.wordsToUse.join(", ") ?? "");
  const [avoid, setAvoid] = useState(voice?.wordsToAvoid.join(", ") ?? "");
  const [samples, setSamples] = useState([0, 1, 2].map((i) => voice?.samplePosts[i] ?? ""));
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);

  function applyPreset(p: (typeof copy.presets)[number]) {
    setPreset(p.name);
    setTone(p.tone);
    setAudience(p.audience);
    setUse(p.use);
    setAvoid(p.avoid);
    setStatus(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tone.trim() && !samples.some((s) => s.trim())) {
      setStatus({ tone: "error", text: copy.emptyVoice });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await save({ tone, audience, wordsToUse: list(use), wordsToAvoid: list(avoid), samplePosts: samples.filter((s) => s.trim()) });
      setStatus({ tone: "ok", text: copy.saved });
    } catch (err) {
      setStatus({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const sampleCount = samples.filter((s) => s.trim()).length;

  return (
    <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-5">
      <div>
        <p className="mb-2 text-meta font-semibold text-ink">{copy.presetsLabel}</p>
        <div className="flex flex-wrap gap-2">
          {copy.presets.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              aria-pressed={preset === p.name}
              className={cn(
                "rounded-full border px-3 py-1.5 text-meta font-semibold transition-colors",
                preset === p.name ? "border-ecto-dim bg-ecto/25 text-ink" : "border-line text-copy hover:bg-surface-muted hover:text-ink",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="tone" hint={copy.toneHint}>{copy.tone}</Label>
          <Input id="tone" maxLength={200} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="curious, clear, warm" />
        </div>
        <div>
          <Label htmlFor="audience" hint={copy.audienceHint}>{copy.audience}</Label>
          <Input id="audience" maxLength={200} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="developers and founders" />
        </div>
        <div>
          <Label htmlFor="use" hint={copy.useHint}>{copy.wordsToUse}</Label>
          <Input id="use" value={use} onChange={(e) => setUse(e.target.value)} placeholder="builders, open web" />
        </div>
        <div>
          <Label htmlFor="avoid" hint={copy.avoidHint}>{copy.wordsToAvoid}</Label>
          <Input id="avoid" value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="game-changer, synergy" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label hint={copy.samplesHint}>{`${copy.samples} · ${sampleCount}/3`}</Label>
        {samples.map((s, i) => (
          <Textarea
            key={i}
            aria-label={`Sample post ${i + 1}`}
            maxLength={2000}
            className="min-h-20"
            placeholder={i === 0 ? "Paste a LinkedIn or X post you wrote…" : undefined}
            value={s}
            onChange={(e) => setSamples((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
          />
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-ecto-dim/40 bg-ecto/10 p-4">
        <Sparkles aria-hidden className="mt-0.5 size-5 shrink-0 text-ecto-ink" strokeWidth={1.75} />
        <div className="text-meta">
          <p className="font-semibold text-ink">{copy.summaryTitle}</p>
          <p className="text-copy">{copy.summary(tone.trim(), audience.trim())}</p>
          {list(use).length ? <p className="text-subtle">+ {list(use).join(", ")}</p> : null}
          {list(avoid).length ? <p className="text-subtle">− {list(avoid).join(", ")}</p> : null}
        </div>
      </div>

      {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
      <Button type="submit" disabled={busy} className="self-start">{copy.save}</Button>
    </form>
  );
}
