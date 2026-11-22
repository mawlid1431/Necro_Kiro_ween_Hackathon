"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

/** The logo: your Dashboard when signed in, the landing page otherwise. */
export function HomeLink({ children, className }: { children: ReactNode; className?: string }) {
  const { isSignedIn } = useAuth();
  return (
    <Link href={isSignedIn ? "/dashboard" : "/"} className={className} aria-label={isSignedIn ? "Necro: your dashboard" : "Necro home"}>
      {children}
    </Link>
  );
}

/** On the landing page: once signed in, the Dashboard is where you belong. */
export function SignedInToHome() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (isLoaded && isSignedIn) router.replace("/dashboard");
  }, [isLoaded, isSignedIn, router]);
  return null;
}
