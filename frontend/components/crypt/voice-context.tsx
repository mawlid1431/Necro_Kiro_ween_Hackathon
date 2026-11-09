"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

/** What the open article can do when a voice command arrives. Registered by ReadingPane. */
export interface ItemVoiceActions {
  read(): void;
  stop(): void;
  seance(): void;
  resurrect(): void;
  star(value: boolean): void;
  markUnread(): void;
}

interface VoiceCtx {
  register(actions: ItemVoiceActions | null): void;
  current(): ItemVoiceActions | null;
}

const Ctx = createContext<VoiceCtx | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const ref = useRef<ItemVoiceActions | null>(null);
  const register = useCallback((a: ItemVoiceActions | null) => {
    ref.current = a;
  }, []);
  const current = useCallback(() => ref.current, []);
  const value = useMemo(() => ({ register, current }), [register, current]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVoice(): VoiceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVoice must be used inside VoiceProvider");
  return v;
}
