"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { ConnectionView } from "@backend/convex/social";
import { PlatformIcon } from "@/components/brand/PlatformIcon";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Notice } from "@/components/ui/field";
import { connectors as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function Card({ c }: { c: ConnectionView }) {
  const begin = useAction(api.socialNode.begin);
  const disconnect = useMutation(api.social.disconnect);
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = copy.names[c.platform];
  const expired = c.status === "expired";

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await begin({ platform: c.platform });
      window.location.assign(url); // the platform's own consent screen
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirm({ title: copy.confirmTitle(name), body: copy.confirmBody, tone: "danger", confirmLabel: copy.disconnect }))) return;
    try {
      await disconnect({ platform: c.platform });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <li className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <PlatformIcon platform={c.platform} brand className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-h3 font-bold">{name}</h2>
          <p className="text-meta text-subtle">{copy.blurb[c.platform]}</p>
        </div>
      </div>

      {c.connected ? (
        <div className="flex items-center gap-3 rounded-md bg-surface-muted px-3 py-2">
          {c.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the connected account's own picture
            <img src={c.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ecto/40 font-bold">{(c.name || c.username || name).slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0 text-meta">
            <p className="truncate font-semibold text-ink">
              {c.name || c.username}
              {c.username && c.name ? <span className="ml-1 font-normal text-subtle">@{c.username}</span> : null}
            </p>
            <p className={cn("font-semibold", expired ? "text-danger" : "text-ecto-ink")}>
              {expired ? copy.expired : copy.connected}
              <span className="ml-1 font-normal text-subtle">
                · {c.canRefresh ? copy.renews : c.expiresAt ? copy.expires(day(c.expiresAt)) : ""}
              </span>
            </p>
          </div>
        </div>
      ) : null}

      {!c.configured ? <Notice>{copy.notSetUp}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="mt-auto flex flex-wrap gap-2">
        {c.connected ? (
          <>
            <Button variant={expired ? "default" : "secondary"} size="sm" onClick={() => void connect()} disabled={busy || !c.configured}>
              {busy ? copy.connecting : copy.reconnect}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void remove()}>
              {copy.disconnect}
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => void connect()} disabled={busy || !c.configured}>
            {busy ? copy.connecting : copy.connect}
          </Button>
        )}
      </div>
    </li>
  );
}

/** The four platforms with their live connection state (Convex pushes every change). */
export function ConnectorsPanel() {
  const rows = useQuery(api.social.list, {});
  const params = useSearchParams();
  const just = params.get("connected") as ConnectionView["platform"] | null;
  return (
    <div className="flex flex-col gap-4">
      {just && copy.names[just] ? <Notice tone="ok">{copy.justConnected(copy.names[just])}</Notice> : null}
      <p className="text-meta text-subtle">{copy.privacy}</p>
      {rows === undefined ? (
        <ul className="grid gap-4 sm:grid-cols-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-48 animate-pulse rounded-lg border border-line bg-surface-muted" />
          ))}
        </ul>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {rows.map((c) => (
            <Card key={c.platform} c={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
