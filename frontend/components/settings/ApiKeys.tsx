"use client";

import { useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Copy, KeyRound } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Notice } from "@/components/ui/field";
import { settings as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/components/crypt/ItemList";

/** MCP keys: create (shown once), list, revoke, plus a ready-to-paste client config. */
export function ApiKeys() {
  const keys = useQuery(api.apiKeys.list);
  const create = useAction(api.apiKeys.create);
  const revoke = useMutation(api.apiKeys.revoke);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window === "undefined" ? "https://YOUR-APP" : window.location.origin;
  const config = JSON.stringify(
    {
      mcpServers: {
        necro: {
          command: "npx",
          args: ["mcp-remote", `${origin}/api/mcp`, "--header", "Authorization: Bearer ${NECRO_API_KEY}"],
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
      const r = await create({ name: name.trim() || "MCP key" });
      setFresh(r.key);
      setName("");
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
            <span className="text-meta text-subtle">
              {copy.lastUsed}: {k.lastUsedAt ? timeAgo(k.lastUsedAt) : copy.never}
            </span>
            {k.revokedAt ? (
              <span className="ml-auto text-meta font-semibold text-danger">{copy.revoked}</span>
            ) : (
              <Button variant="destructive" size="sm" className="ml-auto" onClick={() => void revoke({ keyId: k._id })}>
                {copy.revoke}
              </Button>
            )}
          </li>
        ))}
      </ul>

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
