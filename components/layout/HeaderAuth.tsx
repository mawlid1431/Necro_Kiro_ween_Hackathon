"use client";

import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { auth, labels, landing } from "@/lib/copy";

// Client-side so the header never reads cookies on the server, which keeps
// public pages statically prerendered (Next.js 16 cache components).
export function HeaderAuth() {
  return (
    <>
      <Show when="signed-in">
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/graveyard">{labels.graveyard.themed}</Link>
        </Button>
        <UserButton />
      </Show>
      <Show when="signed-out">
        <SignInButton>
          <Button variant="secondary" size="sm">
            {auth.signIn}
          </Button>
        </SignInButton>
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link href="/graveyard">{landing.cta}</Link>
        </Button>
      </Show>
    </>
  );
}
