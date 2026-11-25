"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Plug } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/field";
import { settings as copy, MCP_URL } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/components/crypt/ItemList";
import { cn } from "@/lib/utils";
import { useMinute } from "@/lib/useMinute";

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Apps connected with OAuth ("Sign in with Necro" from ChatGPT or Claude): list and disconnect. */
export function ConnectedApps() {
  const grants = useQuery(api.mcpOAuth.list);
  const revoke = useMutation(api.mcpOAuth.revoke);
  const setScope = useMutation(api.mcpOAuth.setScope);
  const now = useMinute();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = MCP_URL;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Your browser blocked copying. Select the text and copy it by hand.");
    }
  }

  // Hide disconnected and expired connections after a week so the list stays short.
  const shown = grants?.filter((g) => {
    const ended = g.revokedAt ?? (g.expiresAt <= now ? g.expiresAt : null);
    return ended === null || now - ended < 7 * 86_400_000;
  });

  return (
    <Card aria-labelledby="apps-h">
      <h2 id="apps-h" className="flex items-center gap-2 font-display text-h3 font-bold">
        <Plug aria-hidden className="size-5" strokeWidth={1.75} /> {copy.apps}
      </h2>
      <p className="mt-1 text-meta text-subtle">{copy.appsHint}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-meta font-semibold text-ink">{copy.connectorUrl}</span>
        <code className="min-w-0 flex-1 overflow-x-auto rounded bg-surface-muted px-2 py-1.5 text-meta">{url}</code>
        <Button size="sm" variant="secondary" onClick={() => void copyUrl()}>
          <Copy aria-hidden strokeWidth={1.75} /> {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}

      {shown && shown.length === 0 ? <p className="mt-4 text-meta text-subtle">{copy.appsEmpty}</p> : null}
      <ul className="mt-2 divide-y divide-line">
        {shown?.map((g) => {
          const expired = !g.revokedAt && g.expiresAt <= now;
          return (
            <li key={g._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className="font-semibold text-ink">{g.clientName}</span>
              <code className="text-meta text-subtle">{g.label}</code>
              <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase", g.scope === "write" ? "bg-candle/20 text-ink" : "bg-surface-muted text-subtle")}>
                {g.scope === "write" ? copy.scopeWriteBadge : copy.scopeReadBadge}
              </span>
              <span className="text-meta text-subtle">{copy.connected(day(g.createdAt))}</span>
              {!g.revokedAt ? (
                <span className={cn("text-meta", expired ? "font-semibold text-danger" : "text-subtle")}>{expired ? copy.expired : copy.expires(day(g.expiresAt))}</span>
              ) : null}
              <span className="text-meta text-subtle">
                {copy.lastUsed}: {g.lastUsedAt ? timeAgo(g.lastUsedAt) : copy.never}
              </span>
              {g.revokedAt ? (
                <span className="ml-auto text-meta font-semibold text-danger">{copy.disconnected}</span>
              ) : expired ? null : (
                <span className="ml-auto flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const next = g.scope === "write" ? "read" : "write";
                      if (next === "write" && !window.confirm(copy.allowPostingConfirm(g.clientName))) return;
                      void setScope({ grantId: g._id, scope: next }).catch((e) => setError(errorMessage(e)));
                    }}
                  >
                    {g.scope === "write" ? copy.stopPosting : copy.allowPosting}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void revoke({ grantId: g._id }).catch((e) => setError(errorMessage(e)))}
                  >
                    {copy.disconnect}
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
