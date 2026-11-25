"use client";

import { useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Copy, Eye, KeyRound, PenLine, Trash2 } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Notice } from "@/components/ui/field";
import { MCP_URL, settings as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/components/crypt/ItemList";
import { cn } from "@/lib/utils";
import { useMinute } from "@/lib/useMinute";

/** MCP keys: create (shown once), list, revoke, plus a ready-to-paste client config. */
export function ApiKeys() {
  const keys = useQuery(api.apiKeys.list);
  const create = useAction(api.apiKeys.create);
  const revoke = useMutation(api.apiKeys.revoke);
  const remove = useMutation(api.apiKeys.remove);
  const revokedIds = (keys ?? []).filter((k) => k.revokedAt).map((k) => k._id);

  async function removeKeys(ids: typeof revokedIds) {
    setError(null);
    try {
      for (const keyId of ids) await remove({ keyId });
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const now = useMinute();
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const config = JSON.stringify(
    {
      mcpServers: {
        necro: {
          command: "npx",
          args: ["-y", "mcp-remote", MCP_URL, "--header", "Authorization: Bearer ${NECRO_API_KEY}"],
          env: { NECRO_API_KEY: fresh ?? "necro_sk_..." },
        },
      },
    },
    null,
    2,
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await create({ name: name.trim() || "MCP key", scope });
      setFresh(r.key);
      setName("");
      setScope("read");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setError("Your browser blocked copying. Select the text and copy it by hand.");
    }
  }

  return (
    <Card aria-labelledby="keys-h">
      <h2 id="keys-h" className="font-display text-h3 font-bold">{copy.keys}</h2>
      <p className="mt-1 text-meta text-subtle">{copy.keysHint}</p>

      <fieldset className="mt-4 min-w-0">
        <legend className="mb-2 text-meta font-semibold text-ink">{copy.keyAccess}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            ["read", Eye, copy.scopeRead, copy.scopeReadHint],
            ["write", PenLine, copy.scopeWrite, copy.scopeWriteHint],
          ] as const).map(([value, Icon, label, hint]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                scope === value ? "border-ecto-dim bg-ecto/10" : "border-line hover:bg-surface-muted",
              )}
            >
              <input type="radio" name="key-scope" value={value} checked={scope === value} onChange={() => setScope(value)} className="mt-1 accent-[var(--color-ecto-dim)]" />
              <span>
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <Icon aria-hidden className="size-4" strokeWidth={1.75} /> {label}
                </span>
                <span className="mt-0.5 block text-meta text-subtle">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {scope === "write" ? <div className="mt-2"><Notice>{copy.scopeWriteWarning}</Notice></div> : null}
      </fieldset>

      <form onSubmit={onCreate} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="key-name">{copy.keyName}</Label>
          <Input id="key-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="My AI assistant" />
        </div>
        <Button type="submit" disabled={busy}>
          <KeyRound aria-hidden strokeWidth={1.75} />
          {copy.createKey}
        </Button>
      </form>

      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
      {fresh ? (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-highlight/50 bg-highlight/10 p-3">
          <p className="text-meta font-semibold text-ink">{copy.newKey}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-surface px-2 py-1.5 text-meta">{fresh}</code>
            <Button size="sm" variant="secondary" onClick={() => void copyText("key", fresh)}>
              <Copy aria-hidden strokeWidth={1.75} /> {copied === "key" ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}

      <ul className="mt-4 divide-y divide-line">
        {keys?.map((k) => (
          <li key={k._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="font-semibold text-ink">{k.name}</span>
            <code className="text-meta text-subtle">{k.prefix}…</code>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase",
                k.scope === "write" ? "bg-candle/20 text-ink" : "bg-surface-muted text-subtle",
              )}
            >
              {k.scope === "write" ? copy.scopeWriteBadge : copy.scopeReadBadge}
            </span>
            {k.expiresAt && !k.revokedAt ? (
              <span className={cn("text-meta", k.expiresAt <= now ? "font-semibold text-danger" : "text-subtle")}>
                {k.expiresAt <= now ? copy.expired : copy.expires(new Date(k.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }))}
              </span>
            ) : null}
            <span className="text-meta text-subtle">
              {copy.lastUsed}: {k.lastUsedAt ? timeAgo(k.lastUsedAt) : copy.never}
            </span>
            {k.revokedAt ? (
              <span className="ml-auto flex items-center gap-2">
                <span className="text-meta font-semibold text-danger">{copy.revoked}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${copy.deleteKey} ${k.name}`}
                  title={copy.deleteKey}
                  onClick={() => {
                    if (window.confirm(copy.deleteKeyConfirm(k.name))) void removeKeys([k._id]);
                  }}
                >
                  <Trash2 aria-hidden strokeWidth={1.75} />
                </Button>
              </span>
            ) : (
              <Button variant="destructive" size="sm" className="ml-auto" onClick={() => void revoke({ keyId: k._id })}>
                {copy.revoke}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {revokedIds.length ? (
        <div className="mt-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm(copy.clearRevokedConfirm(revokedIds.length))) void removeKeys(revokedIds);
            }}
          >
            <Trash2 aria-hidden strokeWidth={1.75} /> {copy.clearRevoked(revokedIds.length)}
          </Button>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-meta font-semibold text-ink">{copy.config}</span>
          <Button size="sm" variant="ghost" onClick={() => void copyText("config", config)}>
            <Copy aria-hidden strokeWidth={1.75} /> {copied === "config" ? "Copied" : "Copy"}
          </Button>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-surface-muted p-3 text-meta">{config}</pre>
      </div>
    </Card>
  );
}
