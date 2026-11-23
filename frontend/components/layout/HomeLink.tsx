import type { ReactNode } from "react";
import Link from "next/link";

/** The logo: always the home page (/), signed in or not. The Dashboard lives in the nav. */
export function HomeLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link href="/" className={className} aria-label="Necro home">
      {children}
    </Link>
  );
}
