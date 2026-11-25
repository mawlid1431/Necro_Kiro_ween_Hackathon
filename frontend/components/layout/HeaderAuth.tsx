"use client";

import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { AppNav } from "@/components/layout/AppNav";
import { Button } from "@/components/ui/button";
import { auth, landing, nav } from "@/lib/copy";

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
        <Link href="/docs" className="rounded-md px-2 py-1.5 text-meta font-semibold text-copy transition-colors hover:text-ink">
          {nav.docs}
        </Link>
        <SignInButton>
          <Button variant="secondary" size="sm">
            {auth.signIn}
          </Button>
        </SignInButton>
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link href="/dashboard">{landing.cta}</Link>
        </Button>
      </Show>
    </>
  );
}
