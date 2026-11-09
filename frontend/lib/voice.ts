// Browser-only voice: text-to-speech (Listen) and speech recognition (Talk).
// No servers, keys or costs. Speech recognition exists in Chrome and Edge; elsewhere the mic hides.

// ---------- Listen (speechSynthesis) ----------

const LANG: Record<string, string> = {
  English: "en-US", Malay: "ms-MY", Arabic: "ar-SA", Somali: "so-SO", French: "fr-FR",
  Spanish: "es-ES", German: "de-DE", Indonesian: "id-ID", Chinese: "zh-CN", Hindi: "hi-IN",
};

export const langFor = (language?: string) => (language ? LANG[language] : undefined);

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Chrome stops long utterances after ~15 s, so speak in sentence-sized chunks. */
export function chunk(text: string, max = 220): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length > max && cur) {
      out.push(cur.trim());
      cur = s;
    } else cur = `${cur} ${s}`;
    while (cur.length > max) {
      const cut = cur.lastIndexOf(" ", max) > max * 0.5 ? cur.lastIndexOf(" ", max) : max;
      out.push(cur.slice(0, cut).trim());
      cur = cur.slice(cut);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export interface SpeakPart {
  text: string;
  lang?: string;
}

/** Speaks the parts in order and calls onEnd when the last one finishes (or fails). */
export function speak(parts: SpeakPart[], onEnd?: () => void): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const queue = parts.flatMap((p) => chunk(p.text).map((t) => ({ text: t, lang: p.lang })));
  queue.forEach((q, i) => {
    const u = new SpeechSynthesisUtterance(q.text);
    if (q.lang) u.lang = q.lang;
    u.rate = 1;
    if (i === queue.length - 1) {
      u.onend = () => onEnd?.();
      u.onerror = () => onEnd?.();
    }
    synth.speak(u);
  });
  if (!queue.length) onEnd?.();
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** Plain text from sanitised article HTML, for reading aloud. */
export function htmlToSpeech(html: string): string {
  if (typeof document === "undefined") return "";
  const el = document.createElement("div");
  el.innerHTML = html; // already sanitised at ingest; never attached to the page
  el.querySelectorAll("pre, code, table, figure img").forEach((n) => n.remove());
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

// ---------- Talk (speech recognition) ----------

/** The parts of the Web Speech API we use (not in TypeScript's DOM lib everywhere). */
export interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognizerCtor = new () => Recognizer;

export function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceCommand =
  | { kind: "read" }
  | { kind: "stop" }
  | { kind: "seance" }
  | { kind: "resurrect" }
  | { kind: "star" }
  | { kind: "unstar" }
  | { kind: "unread" }
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "filter"; value: "all" | "unread" | "starred" }
  | { kind: "search"; query: string }
  | { kind: "unknown"; heard: string };

/** Maps what was heard to a command. Order matters: more specific phrases first. */
export function parseCommand(heard: string): VoiceCommand {
  const t = heard.toLowerCase().replace(/[.,!?]/g, "").trim();
  const search = t.match(/^(?:search(?: for)?|find|look for)\s+(.+)$/);
  if (search) return { kind: "search", query: search[1].trim() };
  if (/\b(stop|quiet|silence|pause|enough)\b/.test(t)) return { kind: "stop" };
  if (/\bshow (?:me )?(?:the )?unread\b|\bunread (?:only|articles|posts)\b/.test(t)) return { kind: "filter", value: "unread" };
  if (/\bshow (?:me )?(?:the )?starred\b|\bstarred (?:only|articles|posts)\b/.test(t)) return { kind: "filter", value: "starred" };
  if (/\bshow (?:me )?(?:all|everything)\b/.test(t)) return { kind: "filter", value: "all" };
  if (/\b(mark (?:as |it )?unread|unread)\b/.test(t)) return { kind: "unread" };
  if (/\b(unstar|remove star)\b/.test(t)) return { kind: "unstar" };
  if (/\bstar\b/.test(t)) return { kind: "star" };
  if (/\b(summar|seance|séance|sense|what is this about)/.test(t)) return { kind: "seance" };
  if (/\b(resurrect|drafts?|(?:write|make|create) (?:a |some )?posts?)\b/.test(t)) return { kind: "resurrect" };
  if (/\b(next|skip)\b/.test(t)) return { kind: "next" };
  if (/\b(previous|go back|last one|before)\b/.test(t)) return { kind: "previous" };
  if (/\b(read|listen|play|speak)\b/.test(t)) return { kind: "read" };
  return { kind: "unknown", heard };
}
