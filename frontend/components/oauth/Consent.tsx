"use client";

import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { Eye, PenLine, ShieldCheck } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/field";
import { consent as copy, settings as keyCopy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

interface ConsentProps {
  app: string;
  clientHost: string | null;
  redirectHost: string;
  verified: boolean; // the app's details come from its own website (CIMD), not from a self-registration
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  resource: string;
  issuer: string;
  requested: "read" | "write";
}

/** Builds the redirect back to the app: always with `iss` (RFC 9207) and the app's `state`. */
function backTo(redirectUri: string, issuer: string, state: string | null, params: Record<string, string>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (state) u.searchParams.set("state", state);
  u.searchParams.set("iss", issuer);
  return u.toString();
}

/** "Sign in with Necro": the signed-in user picks read only or read and write, then goes back to the app. */
export function Consent(p: ConsentProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const approve = useAction(api.mcpOAuth.approve);
  // Safer default: read only, even when the app asked for more. The user opts into posting.
  const [scope, setScope] = useState<"read" | "write">("read");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || !isSignedIn || !isAuthenticated || !me) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center" aria-busy>
        <Logo variant="symbol" className="w-12 animate-float opacity-80" />
        {isLoaded && !isSignedIn ? <p className="text-meta text-subtle">{copy.signInHint}</p> : null}
      </div>
    );
  }

  async function onAllow() {
    setBusy(true);
    setError(null);
    try {
      const { code } = await approve({ clientId: p.clientId, redirectUri: p.redirectUri, codeChallenge: p.codeChallenge, scope, resource: p.resource });
      window.location.assign(backTo(p.redirectUri, p.issuer, p.state, { code }));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  function onDeny() {
    setBusy(true);
    window.location.assign(backTo(p.redirectUri, p.issuer, p.state, { error: "access_denied", error_description: "The user cancelled." }));
  }

  const who = user?.primaryEmailAddress?.emailAddress ?? user?.username ?? me.name ?? "";

  return (
    <Card className="w-full max-w-lg" aria-labelledby="consent-h">
      <div className="flex items-center gap-3">
        <Logo variant="symbol" className="w-9" />
        <h1 id="consent-h" className="font-display text-h3 font-bold">{copy.title(p.app)}</h1>
      </div>
      <p className="mt-3 text-body text-ink">{copy.intro(p.app)}</p>
      <ul className="mt-2 space-y-0.5 text-meta text-subtle">
        {p.clientHost ? (
          <li className="flex items-center gap-1.5">
            <ShieldCheck aria-hidden className="size-4" strokeWidth={1.75} /> {copy.verifiedBy(p.clientHost)}
          </li>
        ) : null}
        <li className={p.verified ? undefined : "font-semibold text-ink"}>{copy.returnsTo(p.redirectHost)}</li>
        {who ? <li>{copy.signedInAs(who)}</li> : null}
      </ul>

      {p.verified ? null : <div className="mt-3"><Notice>{copy.unverified(p.app, p.redirectHost)}</Notice></div>}

      <fieldset className="mt-5 min-w-0">
        <legend className="mb-2 text-meta font-semibold text-ink">{copy.access}</legend>
        <div className="grid gap-2">
          {([
            ["read", Eye, keyCopy.scopeRead, keyCopy.scopeReadHint],
            ["write", PenLine, keyCopy.scopeWrite, keyCopy.scopeWriteHint],
          ] as const).map(([value, Icon, label, hint]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                scope === value ? "border-ecto-dim bg-ecto/10" : "border-line hover:bg-surface-muted",
              )}
            >
              <input type="radio" name="oauth-scope" value={value} checked={scope === value} onChange={() => setScope(value)} className="mt-1 accent-[var(--color-ecto-dim)]" />
              <span>
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <Icon aria-hidden className="size-4" strokeWidth={1.75} /> {label}
                </span>
                <span className="mt-0.5 block text-meta text-subtle">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-2">{scope === "write" ? <Notice>{copy.writeWarning}</Notice> : <p className="text-meta text-subtle">{copy.readNote}</p>}</div>
      </fieldset>

      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDeny} disabled={busy}>{copy.deny}</Button>
        <Button onClick={() => void onAllow()} disabled={busy}>{copy.allow}</Button>
      </div>
    </Card>
  );
}

/** Shown when the app itself cannot be trusted (unknown client, unregistered redirect) or sent a bad request. */
export function ConsentError({ message, returnTo }: { message: string; returnTo?: string }) {
  return (
    <Card className="w-full max-w-lg" aria-labelledby="consent-err-h">
      <h1 id="consent-err-h" className="font-display text-h3 font-bold">{copy.errorTitle}</h1>
      <div className="mt-3"><Notice tone="error">{message}</Notice></div>
      <p className="mt-3 text-meta text-subtle">{copy.errorHint}</p>
      {returnTo ? (
        <div className="mt-4 flex justify-end">
          <Button asChild variant="secondary"><a href={returnTo}>{copy.deny}</a></Button>
        </div>
      ) : null}
    </Card>
  );
}
