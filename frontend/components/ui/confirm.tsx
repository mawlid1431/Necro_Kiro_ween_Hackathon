"use client";

import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/field";
import { dialogs as copy } from "@/lib/copy";

type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  /** "danger" for deletes: the confirm button is red. */
  tone?: "default" | "danger";
};
type AskOptions = ConfirmOptions & { label: string; placeholder?: string; maxLength?: number };

type Pending =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "ask"; opts: AskOptions; resolve: (text: string | null) => void };

const Ctx = createContext<{ confirm: (o: ConfirmOptions) => Promise<boolean>; ask: (o: AskOptions) => Promise<string | null> } | null>(null);

/**
 * In-app replacement for window.confirm / window.prompt, in the brand dialog:
 *   const { confirm } = useConfirm();  if (await confirm({ title, body, tone: "danger" })) ...
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const settled = useRef(false);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        settled.current = false;
        setPending({ kind: "confirm", opts, resolve });
      }),
    [],
  );
  const ask = useCallback(
    (opts: AskOptions) =>
      new Promise<string | null>((resolve) => {
        settled.current = false;
        setText("");
        setPending({ kind: "ask", opts, resolve });
      }),
    [],
  );

  function finish(value: boolean | string | null) {
    if (!pending || settled.current) return;
    settled.current = true;
    if (pending.kind === "confirm") pending.resolve(value === true);
    else pending.resolve(typeof value === "string" ? value : null);
    setPending(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    finish(pending?.kind === "ask" ? text.trim() : true);
  }

  const o = pending?.opts;
  return (
    <Ctx.Provider value={{ confirm, ask }}>
      {children}
      {pending && o ? (
        <Dialog open onOpenChange={(open) => !open && finish(pending.kind === "ask" ? null : false)} title={o.title} description={o.body} className="max-w-md">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {pending.kind === "ask" ? (
              <div>
                <Label htmlFor="ask-input">{pending.opts.label}</Label>
                <Input
                  id="ask-input"
                  autoFocus
                  value={text}
                  maxLength={pending.opts.maxLength ?? 280}
                  placeholder={pending.opts.placeholder}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => finish(pending.kind === "ask" ? null : false)}>
                {copy.cancel}
              </Button>
              <Button
                type="submit"
                autoFocus={pending.kind === "confirm"}
                variant={o.tone === "danger" ? "destructive" : "default"}
                className={o.tone === "danger" ? "border border-danger/40 bg-danger/10 hover:bg-danger/15" : undefined}
              >
                {o.confirmLabel ?? copy.ok}
              </Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
