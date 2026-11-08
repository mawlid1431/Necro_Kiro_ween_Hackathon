"use client";

import type { ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { Logo } from "@/components/brand/Logo";

/**
 * Renders the app only once Convex sees the signed-in user AND their user row exists.
 * Without this, queries that require a user can run in the instant between sign-in and
 * users.store (ConvexClientProvider), and throw.
 */
export function UserGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  if (isLoading || !isAuthenticated || !me) {
    return (
      <div className="flex flex-1 items-center justify-center py-24" aria-busy aria-label="Opening the graveyard">
        <Logo variant="symbol" className="w-12 animate-float opacity-80" />
      </div>
    );
  }
  return <>{children}</>;
}
