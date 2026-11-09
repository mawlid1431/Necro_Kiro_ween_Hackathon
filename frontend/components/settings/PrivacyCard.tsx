"use client";

import { useState } from "react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { useClerk } from "@clerk/nextjs";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Notice } from "@/components/ui/field";
import { privacy as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

/** Private mode switch. */
export function PrivacyCard() {
  const me = useQuery(api.users.me);
  const setPrivateMode = useMutation(api.users.setPrivateMode);
  const on = me?.privateMode ?? false;
  return (
    <Card aria-labelledby="privacy-h">
      <h2 id="privacy-h" className="font-display text-h3 font-bold">{copy.title}</h2>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-semibold text-ink">
            <ShieldCheck aria-hidden className="size-5 text-ecto-ink" strokeWidth={1.75} /> {copy.privateMode}
          </p>
          <p className="mt-1 max-w-xl text-meta text-subtle">{copy.privateHint}</p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label={copy.privateMode}
          disabled={!me}
          onClick={() => void setPrivateMode({ value: !on })}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full border-[1.5px] transition-colors duration-200 disabled:opacity-50",
            on ? "border-ecto-dim bg-ecto" : "border-line bg-surface-muted",
          )}
        >
          <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow transition-transform duration-200 motion-reduce:transition-none", on && "translate-x-5")} />
          <span className="sr-only">{on ? copy.on : copy.off}</span>
        </button>
      </div>
    </Card>
  );
}

/** Export everything as JSON, or delete the account (typed confirmation), then sign out. */
export function YourDataCard() {
  const convex = useConvex();
  const deleteAll = useAction(api.users.deleteAllData);
  const { signOut } = useClerk();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportJson() {
    setBusy("export");
    setError(null);
    try {
      const data = await convex.query(api.graves.exportData, {});
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `necro-export-${data.exportedAt.slice(0, 10)}.json` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    if (confirm !== "DELETE") return;
    setBusy("delete");
    setError(null);
    try {
      await deleteAll({ confirm: "DELETE" });
      await signOut({ redirectUrl: "/" });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  return (
    <Card aria-labelledby="data-h">
      <h2 id="data-h" className="font-display text-h3 font-bold">{copy.dataTitle}</h2>
      <p className="mt-1 text-meta text-subtle">{copy.dataHint}</p>
      <Button variant="secondary" size="sm" className="mt-4" disabled={busy !== null} onClick={() => void exportJson()}>
        <Download aria-hidden strokeWidth={1.75} /> {busy === "export" ? copy.exporting : copy.exportJson}
      </Button>

      <div className="mt-6 rounded-lg border border-danger/30 bg-danger/5 p-4">
        <h3 className="font-semibold text-danger">{copy.deleteTitle}</h3>
        <p className="mt-1 text-meta text-copy">{copy.deleteHint}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="sm:w-64">
            <Label htmlFor="delete-confirm">{copy.deleteType}</Label>
            <Input id="delete-confirm" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
          </div>
          <Button variant="destructive" className="border border-danger/40" disabled={confirm !== "DELETE" || busy !== null} onClick={() => void deleteAccount()}>
            <Trash2 aria-hidden strokeWidth={1.75} /> {busy === "delete" ? copy.deleting : copy.deleteButton}
          </Button>
        </div>
      </div>
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
    </Card>
  );
}
