"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { voice as copy } from "@/lib/copy";
import { parseCommand, recognizerCtor, type Recognizer, type VoiceCommand } from "@/lib/voice";
import { cn } from "@/lib/utils";
import { useVoice } from "./voice-context";

/**
 * Talk to the Crypt: press, say a command, done. Uses the browser's speech recognition
 * (Chrome, Edge); hidden where it is not available. Audio goes only to the browser vendor's
 * recogniser, never to Necro's servers.
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
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rec = useRef<Recognizer | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSupported(recognizerCtor() !== null), 0);
    return () => {
      clearTimeout(t);
      rec.current?.abort();
    };
  }, []);

  function run(cmd: VoiceCommand) {
    const item = voice.current();
    const needItem = () => {
      if (!item) setNote(copy.noArticle);
      return item;
    };
    switch (cmd.kind) {
      case "next": return onNavigate(1);
      case "previous": return onNavigate(-1);
      case "filter": return onFilter(cmd.value);
      case "search": return onSearch(cmd.query);
      case "stop": return item?.stop();
      case "read": return needItem()?.read();
      case "seance": return needItem()?.seance();
      case "resurrect": return needItem()?.resurrect();
      case "star": return needItem()?.star(true);
      case "unstar": return needItem()?.star(false);
      case "unread": return needItem()?.markUnread();
      case "unknown": return setNote(`${copy.unknown(cmd.heard)} ${copy.help}`);
    }
  }

  function toggle() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = recognizerCtor();
    if (!Ctor) return;
    voice.current()?.stop(); // don't let Necro hear itself
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const heard = e.results[0]?.[0]?.transcript ?? "";
      const cmd = parseCommand(heard);
      if (cmd.kind !== "unknown") setNote(copy.heard(heard));
      run(cmd);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setNote(copy.blocked);
      else if (e.error !== "no-speech" && e.error !== "aborted") setNote(copy.help);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setNote(null);
    setListening(true);
    r.start();
  }

  if (!supported) return null;
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={listening ? "default" : "secondary"}
        size="sm"
        onClick={toggle}
        aria-pressed={listening}
        title={copy.help}
        className={cn(listening && "animate-pulse")}
      >
        {listening ? <MicOff aria-hidden strokeWidth={1.75} /> : <Mic aria-hidden strokeWidth={1.75} />}
        {listening ? copy.listening : copy.talk}
      </Button>
      {note ? (
        <p role="status" className="text-meta text-subtle">
          {note}
        </p>
      ) : null}
    </div>
  );
}
