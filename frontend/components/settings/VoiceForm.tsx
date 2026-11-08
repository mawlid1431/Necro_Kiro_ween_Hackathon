"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Notice, Textarea } from "@/components/ui/field";
import { settings as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";

const list = (s: string) => s.split(",").map((w) => w.trim()).filter(Boolean);
type Voice = FunctionReturnType<typeof api.voice.get>;

/** Voice profile used by Resurrect. */
export function VoiceForm() {
  const voice = useQuery(api.voice.get);
  return (
    <Card aria-labelledby="voice-h">
      <h2 id="voice-h" className="font-display text-h3 font-bold">{copy.voice}</h2>
      <p className="mt-1 text-meta text-subtle">{copy.voiceHint}</p>
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
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

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="tone">{copy.tone}</Label>
        <Input id="tone" maxLength={200} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="curious, clear, warm" />
      </div>
      <div>
        <Label htmlFor="audience">{copy.audience}</Label>
        <Input id="audience" maxLength={200} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="developers and founders" />
      </div>
      <div>
        <Label htmlFor="use">{copy.wordsToUse}</Label>
        <Input id="use" value={use} onChange={(e) => setUse(e.target.value)} placeholder="builders, open web" />
      </div>
      <div>
        <Label htmlFor="avoid">{copy.wordsToAvoid}</Label>
        <Input id="avoid" value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="game-changer, synergy" />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label>{copy.samples}</Label>
        {samples.map((s, i) => (
          <Textarea
            key={i}
            aria-label={`Sample post ${i + 1}`}
            maxLength={2000}
            className="min-h-20"
            value={s}
            onChange={(e) => setSamples((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
          />
        ))}
      </div>
      {status ? <div className="sm:col-span-2"><Notice tone={status.tone}>{status.text}</Notice></div> : null}
      <Button type="submit" disabled={busy} className="self-start">{copy.save}</Button>
    </form>
  );
}
