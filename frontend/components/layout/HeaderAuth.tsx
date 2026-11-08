"use client";

import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { AppNav } from "@/components/layout/AppNav";
import { Button } from "@/components/ui/button";
import { auth, landing } from "@/lib/copy";

// Client-side so the header never reads cookies on the server, which keeps
// public pages statically prerendered (Next.js 16 cache components).
export function HeaderAuth() {
  return (
    <>
      <Show when="signed-in">
        <AppNav />
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
