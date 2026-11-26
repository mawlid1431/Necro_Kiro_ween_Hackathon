"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useAction, useMutation, useQueries, useQuery } from "convex/react";
import { Copy, Eye, KeyRound, PenLine, Trash2 } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, Input, Label, Notice } from "@/components/ui/field";
import { MCP_URL, settings as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/components/crypt/ItemList";
import { cn } from "@/lib/utils";
import { useMinute } from "@/lib/useMinute";
import { useConfirm } from "@/components/ui/confirm";

/** MCP keys: create (shown once), list, revoke, plus a ready-to-paste client config. */
export function ApiKeys() {
  const keys = useQuery(api.apiKeys.list);
  const create = useAction(api.apiKeys.create);
  const revoke = useMutation(api.apiKeys.revoke);
  const remove = useMutation(api.apiKeys.remove);
  const setKeyScope = useMutation(api.apiKeys.setScope);
  const { confirm } = useConfirm();

  async function changeScope(keyId: NonNullable<typeof keys>[number]["_id"], keyName: string, next: "read" | "write") {
    if (next === "write" && !(await confirm({ title: copy.allowPostingTitle, body: copy.allowPostingConfirm(keyName), confirmLabel: copy.allowPosting }))) return;
    setError(null);
    try {
      await setKeyScope({ keyId, scope: next });
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  const revokedIds = (keys ?? []).filter((k) => k.revokedAt).map((k) => k._id);

  // Bulk delete for revoked keys: tick some (or Select all), then Delete selected. Only revoked keys can be picked.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const selected = revokedIds.filter((id) => picked.has(id)); // drops ids that are gone or no longer revoked
  const allPicked = revokedIds.length > 0 && selected.length === revokedIds.length;
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Asks first (in the app's own dialog, with an "I understand" tick box), then deletes for good. */
  async function removeKeys(ids: typeof revokedIds) {
    if (!ids.length) return;
    const names = (keys ?? []).filter((k) => ids.includes(k._id)).map((k) => k.name);
    const ok = await confirm({
      title: ids.length === 1 ? copy.deleteKeyTitle(names[0] ?? "") : copy.deleteKeysTitle(ids.length),
      body: copy.deleteKeysBody,
      acknowledge: copy.deleteKeysAck,
      confirmLabel: ids.length === 1 ? copy.deleteKey : copy.deleteKeysButton(ids.length),
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      for (const keyId of ids) await remove({ keyId });
      setPicked(new Set());
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
          <li key={k._id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5", k.revokedAt && picked.has(k._id) && "bg-danger/5")}>
            {k.revokedAt ? (
              <input
                type="checkbox"
                checked={picked.has(k._id)}
                onChange={() => toggle(k._id)}
                aria-label={copy.selectKey(k.name)}
                className="size-4 shrink-0 cursor-pointer accent-[var(--color-danger)]"
              />
            ) : null}
            <span className="font-semibold text-ink">{k.name}</span>
            <code data-secret className="text-meta text-subtle">{k.prefix}…</code>
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
                  onClick={() => void removeKeys([k._id])}
                >
                  <Trash2 aria-hidden strokeWidth={1.75} />
                </Button>
              </span>
            ) : (
              <span className="ml-auto flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void changeScope(k._id, k.name, k.scope === "write" ? "read" : "write")}>
                  {k.scope === "write" ? copy.stopPosting : copy.allowPosting}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void revoke({ keyId: k._id })}>
                  {copy.revoke}
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {revokedIds.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-muted/50 px-3 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-meta font-semibold text-ink">
            <input
              type="checkbox"
              checked={allPicked}
              ref={(el) => {
                if (el) el.indeterminate = selected.length > 0 && !allPicked;
              }}
              onChange={() => setPicked(allPicked ? new Set() : new Set(revokedIds))}
              className="size-4 cursor-pointer accent-[var(--color-danger)]"
            />
            {copy.selectAllRevoked(revokedIds.length)}
          </label>
          <span className="text-meta text-subtle">{copy.selectedCount(selected.length)}</span>
          <span className="ml-auto flex items-center gap-2">
            {selected.length ? (
              <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                {copy.unselect}
              </Button>
            ) : null}
            <Button variant="destructive" size="sm" disabled={!selected.length} onClick={() => void removeKeys(selected)}>
              <Trash2 aria-hidden strokeWidth={1.75} /> {copy.deleteKeysButton(selected.length)}
            </Button>
          </span>
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

      <PostingAudit />
    </Card>
  );
}

/** The MCP posting audit log (live): every write call, refused ones included, plus the limits in force. */
function PostingAudit() {
  // useQueries hands back an Error instead of throwing: if the log cannot load (for example a backend that is not
  // deployed yet), only this panel says so, and the rest of Settings keeps working.
  const queries = useMemo(() => ({ rows: { query: api.mcpWrite.auditLog, args: { limit: 30 } }, limits: { query: api.mcpWrite.limits, args: {} } }), []);
  const r = useQueries(queries);
  const failed = r.rows instanceof Error || r.limits instanceof Error;
  if (failed) console.error("Posting activity failed to load", r.rows instanceof Error ? r.rows : r.limits);
  const rows = failed ? undefined : (r.rows as FunctionReturnType<typeof api.mcpWrite.auditLog> | undefined);
  const limits = failed ? undefined : (r.limits as FunctionReturnType<typeof api.mcpWrite.limits> | undefined);
  return (
    <section aria-labelledby="audit-h" className="mt-6 border-t border-line pt-4">
      <h3 id="audit-h" className="font-semibold text-ink">{copy.audit}</h3>
      <p className="mt-1 text-meta text-subtle">{copy.auditHint}</p>
      {failed ? <p className="mt-3 text-meta text-subtle">{copy.auditUnavailable}</p> : null}
      {limits ? <p className="mt-1 text-meta text-subtle">{copy.limitsLine(limits)}</p> : null}
      {rows && rows.length === 0 ? <p className="mt-3 text-meta text-subtle">{copy.auditEmpty}</p> : null}
      <ul className="mt-2 divide-y divide-line">
        {rows?.map((r) => (
          <li key={r._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-meta">
            <code className="text-ink">{r.tool}</code>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase",
                r.status === "ok" ? "bg-surface-muted text-subtle" : "bg-danger/15 text-danger",
              )}
            >
              {r.status === "ok" ? copy.auditOk : copy.auditRefused}
            </span>
            <code className="text-subtle">{r.keyLabel}</code>
            {r.postId ? <code className="text-subtle">{r.postId}</code> : null}
            {r.message ? <span className="min-w-0 break-words text-subtle">{r.message}</span> : null}
            <span className="ml-auto text-subtle" title={new Date(r.at).toLocaleString()}>{timeAgo(r.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
