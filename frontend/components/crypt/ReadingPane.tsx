"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ExternalLink, Sparkles, Square, Star, Volume2 } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { crypt as copy, kindred as kcopy, resurrect as rcopy, voice as vcopy } from "@/lib/copy";
import { canSpeak, htmlToSpeech, langFor, pauseSpeaking, resumeSpeaking, speak, stopSpeaking, type SpeakPart, type SpeakProgress } from "@/lib/voice";
import { ListenBar } from "./ListenBar";
import { timeAgo } from "./ItemList";
import { SeanceCard } from "./SeanceCard";
import { SecondOpinion } from "./SecondOpinion";
import { ResurrectDialog } from "./ResurrectDialog";
import { useVoice } from "./voice-context";

/** "Séance. One. Two. Three. Reason." without doubled full stops when bullets already end with one. */
const spokenSeance = (summary: string[], reason: string) =>
  ["Séance", ...summary, reason].map((x) => x.trim().replace(/[.!?…]+$/, "")).filter(Boolean).join(". ") + ".";

export function ReadingPane({ itemId, onOpen }: { itemId: Id<"items">; onOpen?: (id: Id<"items">) => void }) {
  const item = useQuery(api.items.get, { itemId });
  const me = useQuery(api.users.me);
  const setRead = useMutation(api.items.setRead);
  const setStarred = useMutation(api.items.setStarred);
  const holdSeance = useAction(api.aiNode.holdSeance);
  const [resurrectOpen, setResurrectOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [progress, setProgress] = useState<SpeakProgress | null>(null);
  const [paused, setPaused] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const marked = useRef(false);
  const voice = useVoice();

  // Opening an article marks it read, once.
  useEffect(() => {
    if (item && !item.isRead && !marked.current) {
      marked.current = true;
      void setRead({ itemId, value: true });
    }
  }, [item, itemId, setRead]);

  // Feature-detect after mount (window does not exist during server rendering).
  useEffect(() => {
    const t = setTimeout(() => setSpeechOk(canSpeak()), 0);
    return () => clearTimeout(t);
  }, []);

  // Stop talking when the article changes or the pane closes.
  useEffect(() => () => stopSpeaking(), [itemId]);

  const seanceLang = langFor(me?.summaryLanguage);

  const read = useCallback(
    (onlySeance = false) => {
      if (!item) return;
      const parts: SpeakPart[] = [];
      if (item.seance) parts.push({ text: spokenSeance(item.seance.summary, item.seance.reason), lang: seanceLang, label: "Séance" });
      if (!onlySeance) parts.push({ text: `${item.title}. ${htmlToSpeech(item.contentHtml) || item.excerpt}`, label: "Article" });
      setSpeaking(true);
      setPaused(false);
      setProgress(null);
      speak(parts, () => (setSpeaking(false), setProgress(null)), setProgress);
    },
    [item, seanceLang],
  );

  const stop = useCallback(() => {
    stopSpeaking();
    setSpeaking(false);
    setProgress(null);
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (paused) resumeSpeaking();
    else pauseSpeaking();
    setPaused(!paused);
  }, [paused]);

  // Register this article's actions for voice commands from the Crypt toolbar.
  useEffect(() => {
    if (!item) return;
    voice.register({
      read: () => read(),
      stop,
      seance: () => {
        if (item.seance) read(true);
        else void holdSeance({ itemId }).then((s) => {
          setSpeaking(true);
          speak([{ text: spokenSeance(s.summary, s.reason), lang: seanceLang, label: "Séance" }], () => (setSpeaking(false), setProgress(null)), setProgress);
        });
      },
      resurrect: () => setResurrectOpen(true),
      star: (value) => void setStarred({ itemId, value }),
      markUnread: () => void setRead({ itemId, value: false }),
    });
    return () => voice.register(null);
  }, [item, itemId, read, stop, holdSeance, seanceLang, setStarred, setRead, voice]);

  if (item === undefined) {
    return <div aria-busy className="h-96 animate-pulse rounded-xl border border-line bg-surface-muted/50" />;
  }

  return (
    <article className="rounded-xl border border-line bg-surface p-5 sm:p-8">
      <p className="text-overline font-bold tracking-[0.12em] text-subtle uppercase">
        {item.graveTitle} · {timeAgo(item.publishedAt)}
        {item.author ? ` · ${item.author}` : ""}
      </p>
      <h2 className="mt-2 font-display text-h2 font-bold sm:text-[1.75rem] sm:leading-9">{item.title}</h2>

      {item.kindred.length ? (
        <aside aria-label={kcopy.plain} className="mt-3 rounded-lg border border-line bg-surface-muted/60 px-4 py-3">
          <p className="text-meta font-semibold text-ink">
            <span className="mr-1.5 text-overline font-bold tracking-[0.12em] text-ecto-ink uppercase">{kcopy.label}</span>
            {kcopy.alsoIn(item.kindred.length)}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {item.kindred.map((k) => (
              <li key={k._id}>
                <button onClick={() => onOpen?.(k._id)} className="text-left text-meta text-copy underline-offset-4 hover:text-ink hover:underline">
                  <span className="font-semibold">{k.graveTitle}</span> · {k.title}
                </button>
              </li>
            ))}
          </ul>
          <SecondOpinion itemId={itemId} onOpen={onOpen} />
        </aside>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void setStarred({ itemId, value: !item.isStarred })} aria-pressed={item.isStarred}>
          <Star aria-hidden className={item.isStarred ? "fill-highlight text-highlight" : ""} strokeWidth={1.75} />
          {item.isStarred ? copy.unstar : copy.star}
        </Button>
        {speechOk ? (
          <Button variant="secondary" size="sm" onClick={() => (speaking ? stop() : read())} aria-pressed={speaking}>
            {speaking ? <Square aria-hidden strokeWidth={1.75} /> : <Volume2 aria-hidden strokeWidth={1.75} />}
            {speaking ? vcopy.stop : vcopy.listen}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => void setRead({ itemId, value: false })}>
          {copy.markUnread}
        </Button>
        {item.link ? (
          <Button asChild variant="ghost" size="sm">
            <a href={item.link} target="_blank" rel="noopener noreferrer nofollow">
              <ExternalLink aria-hidden strokeWidth={1.75} />
              {copy.openOriginal}
            </a>
          </Button>
        ) : null}
        <Button size="sm" className="ml-auto" onClick={() => setResurrectOpen(true)}>
          <Sparkles aria-hidden strokeWidth={1.75} />
          {rcopy.open}
        </Button>
      </div>

      <div className="mt-6">
        <SeanceCard itemId={itemId} seance={item.seance} />
      </div>

      {/* contentHtml is sanitised with an allowlist at ingest (backend/lib/sanitize.ts).
          The excerpt is decoded plain text, so it is rendered as text, never as HTML. */}
      {item.contentHtml ? (
        <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: item.contentHtml }} />
      ) : (
        <div className="article-body mt-8">
          <p>{item.excerpt}</p>
        </div>
      )}

      {speaking ? <ListenBar title={item.title} progress={progress} paused={paused} onPause={togglePause} onStop={stop} /> : null}
      <ResurrectDialog open={resurrectOpen} onOpenChange={setResurrectOpen} itemId={itemId} drafts={item.drafts} article={{ title: item.title, link: item.link, source: item.graveTitle ?? "" }} />
    </article>
  );
}
