"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { SocialPlatform } from "@backend/lib/social/post";
import { PlatformIcon } from "@/components/brand/PlatformIcon";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/field";
import { connectors as copy } from "@/lib/copy";
import { errorMessage } from "@/lib/errors";

/** Where each platform sends the browser back. Hands `code` + `state` to Convex once, then returns to Connectors. */
export function ConnectCallback({ platform }: { platform: SocialPlatform }) {
  const params = useSearchParams();
  const router = useRouter();
  const complete = useAction(api.socialNode.complete);
  const { isAuthenticated } = useConvexAuth();
  const started = useRef(false);
  const name = copy.names[platform];
  const code = params.get("code");
  const state = params.get("state");
  const denied = params.get("error") || params.get("error_code");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    // Once, as soon as the session is ready: codes are single-use (X's expire in 30 seconds).
    if (started.current || !isAuthenticated || denied || !code || !state) return;
    started.current = true;
    complete({ platform, code, state })
      .then((r) => {
        setResult({ ok: true, text: copy.callbackDone(name, r.name) });
        router.replace(`/settings?connected=${platform}#connections`);
      })
      .catch((e) => setResult({ ok: false, text: errorMessage(e) }));
  }, [isAuthenticated, code, state, denied, platform, complete, name, router]);

  const message = denied || (!code && !result) ? { ok: false, text: copy.callbackDenied(name) } : result;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <PlatformIcon platform={platform} brand className="size-12" />
      {message ? <Notice tone={message.ok ? "ok" : "error"}>{message.text}</Notice> : <p role="status" className="text-body text-subtle">{copy.callbackWorking(name)}</p>}
      {message && !message.ok ? (
        <Button asChild variant="secondary">
          <Link href="/settings#connections">{copy.back}</Link>
        </Button>
      ) : null}
    </div>
  );
}
