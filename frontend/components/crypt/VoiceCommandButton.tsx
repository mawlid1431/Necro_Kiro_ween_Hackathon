"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Mic, MicOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { voice as copy } from "@/lib/copy";
import { parseCommand, recognizerCtor, type Recognizer, type VoiceCommand } from "@/lib/voice";
import { cn } from "@/lib/utils";
import { useVoice } from "./voice-context";

type Panel =
  | { kind: "listening"; live: string }
  | { kind: "done"; heard: string; did: string }
  | { kind: "error"; text: string };

/** What a command did, said back to the user. */
function didText(cmd: VoiceCommand): string {
  switch (cmd.kind) {
    case "filter":
      return copy.done.filter(cmd.value);
    case "search":
      return copy.done.search(cmd.query);
    case "unknown":
      return "";
    default:
      return copy.done[cmd.kind];
  }
}

/**
 * Talk to the Crypt: press, say a command, see what was heard and what happened.
 * Uses the browser's speech recognition (Chrome, Edge); hidden where it is not available.
 * Audio goes only to the browser vendor's recogniser, never to Necro's servers.
 */
export function VoiceCommandButton({
  onNavigate,
  onFilter,
  onSearch,
}: {
  onNavigate: (delta: 1 | -1) => void;
  onFilter: (value: "all" | "unread" | "starred") => void;
  onSearch: (query: string) => void;
}) {
  const voice = useVoice();
  const [supported, setSupported] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const rec = useRef<Recognizer | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listening = panel?.kind === "listening";

  useEffect(() => {
    const t = setTimeout(() => setSupported(recognizerCtor() !== null), 0);
    return () => {
      clearTimeout(t);
      if (hide.current) clearTimeout(hide.current);
      rec.current?.abort();
    };
  }, []);

  function show(p: Panel | null, autoHideMs?: number) {
    if (hide.current) clearTimeout(hide.current);
    setPanel(p);
    if (autoHideMs) hide.current = setTimeout(() => setPanel(null), autoHideMs);
  }

  /** Runs the command; returns an error message when it needs an open article and there is none. */
  function run(cmd: VoiceCommand): string | null {
    const item = voice.current();
    const withItem = (fn: (i: NonNullable<typeof item>) => void) => (item ? (fn(item), null) : copy.noArticle);
    switch (cmd.kind) {
      case "next": return (onNavigate(1), null);
      case "previous": return (onNavigate(-1), null);
      case "filter": return (onFilter(cmd.value), null);
      case "search": return (onSearch(cmd.query), null);
      case "stop": return (item?.stop(), null);
      case "read": return withItem((i) => i.read());
      case "seance": return withItem((i) => i.seance());
      case "resurrect": return withItem((i) => i.resurrect());
      case "star": return withItem((i) => i.star(true));
      case "unstar": return withItem((i) => i.star(false));
      case "unread": return withItem((i) => i.markUnread());
      case "unknown": return copy.unknown(cmd.heard);
    }
  }

  function start() {
    const Ctor = recognizerCtor();
    if (!Ctor) return;
    voice.current()?.stop(); // don't let Necro hear itself
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = false;
    r.interimResults = true; // show words as they are heard
    r.maxAlternatives = 1;
    let finished = false;
    r.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) final = true;
      }
      if (!final) return show({ kind: "listening", live: text });
      finished = true;
      const cmd = parseCommand(text);
      const err = run(cmd);
      if (err) show({ kind: "error", text: cmd.kind === "unknown" ? `${err} ${copy.help}` : err });
      else show({ kind: "done", heard: text, did: didText(cmd) }, 3500);
    };
    r.onerror = (e) => {
      finished = true;
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") show({ kind: "error", text: copy.blocked });
      else if (e.error === "no-speech") show({ kind: "error", text: `${copy.noSpeech} ${copy.help}` });
      else if (e.error !== "aborted") show({ kind: "error", text: copy.help });
      else show(null);
    };
    r.onend = () => {
      if (!finished) show(null); // ended without a result (e.g. cancelled)
    };
    rec.current = r;
    show({ kind: "listening", live: "" });
    r.start();
  }

  function cancel() {
    rec.current?.abort();
    show(null);
  }

  if (!supported) return null;
  return (
    <>
      <Button variant={listening ? "default" : "secondary"} size="sm" onClick={listening ? cancel : start} aria-pressed={listening} title={copy.help}>
        {listening ? <MicOff aria-hidden strokeWidth={1.75} /> : <Mic aria-hidden strokeWidth={1.75} />}
        {listening ? copy.listening : copy.talk}
      </Button>

      {panel ? (
        <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md md:bottom-8">
          <div className="rounded-2xl border border-line bg-surface/95 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-start gap-3">
              <span className="relative grid size-11 shrink-0 place-items-center">
                {panel.kind === "listening" ? (
                  <>
                    <span aria-hidden className="absolute inset-0 animate-ring rounded-full bg-ecto/50 motion-reduce:animate-none" />
                    <span aria-hidden className="absolute inset-0 animate-ring rounded-full bg-ecto/40 [animation-delay:0.8s] motion-reduce:animate-none" />
                  </>
                ) : null}
                <span
                  className={cn(
                    "relative grid size-11 place-items-center rounded-full",
                    panel.kind === "error" ? "bg-danger/10 text-danger" : panel.kind === "done" ? "bg-ecto/30 text-ecto-ink" : "bg-ecto text-ink",
                  )}
                >
                  {panel.kind === "done" ? <Check aria-hidden className="size-5" /> : panel.kind === "error" ? <MicOff aria-hidden className="size-5" strokeWidth={1.75} /> : <Mic aria-hidden className="size-5" strokeWidth={1.75} />}
                </span>
              </span>

              <div className="min-w-0 flex-1">
                {panel.kind === "listening" ? (
                  <>
                    <p className="font-semibold text-ink">{copy.listening}</p>
                    <p className="mt-0.5 min-h-5 text-meta text-copy italic">{panel.live ? `“${panel.live}”` : copy.sayCommand}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {copy.examples.map((ex) => (
                        <span key={ex} className="rounded-full bg-surface-muted px-2.5 py-0.5 text-[0.75rem] font-medium text-subtle">
                          “{ex}”
                        </span>
                      ))}
                    </div>
                  </>
                ) : panel.kind === "done" ? (
                  <>
                    <p className="font-semibold text-ink">{panel.did}</p>
                    <p className="mt-0.5 text-meta text-subtle">{copy.heard(panel.heard)}</p>
                  </>
                ) : (
                  <p className="text-meta text-copy">{panel.text}</p>
                )}
              </div>

              <button
                type="button"
                onClick={listening ? cancel : () => show(null)}
                aria-label={listening ? copy.cancel : copy.close}
                className="-m-1 rounded-md p-1 text-subtle hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
