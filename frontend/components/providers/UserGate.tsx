"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { Logo } from "@/components/brand/Logo";

/**
 * Guards the signed-in area on the client:
 * - signed out (Clerk loaded, no session) -> redirect to /sign-in and come back afterwards;
 * - signed in -> render only once Convex sees the user AND their user row exists. Without this,
 *   queries that require a user can run in the instant between sign-in and users.store and throw.
 * Data is never exposed by this component: every Convex function checks the user on the server.
 */
export function UserGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace(`/sign-in?redirect_url=${encodeURIComponent(pathname)}`);
  }, [isLoaded, isSignedIn, pathname, router]);

  if (!isLoaded || !isSignedIn || isLoading || !isAuthenticated || !me) {
    return (
      <div className="flex flex-1 items-center justify-center py-24" aria-busy aria-label="Opening the graveyard">
        <Logo variant="symbol" className="w-12 animate-float opacity-80" />
      </div>
    );
  }
  return <>{children}</>;
}
