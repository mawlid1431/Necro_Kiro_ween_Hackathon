import type { ReactNode } from "react";
import { FogBackground } from "@/components/brand/FogBackground";
import { SiteHeader } from "@/components/layout/SiteHeader";

/** Centred, fog-backed frame for Clerk's sign-in and sign-up cards. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <>
      <FogBackground />
      <SiteHeader />
      <main className="grid flex-1 place-items-center px-4 py-12">{children}</main>
    </>
  );
}
