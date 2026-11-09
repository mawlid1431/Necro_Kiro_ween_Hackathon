"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { nav } from "@/lib/copy";
import { cn } from "@/lib/utils";

const links = [
  { href: "/graveyard", label: nav.graveyard },
  { href: "/crypt", label: nav.crypt },
  { href: "/discover", label: nav.discover },
  { href: "/doctor", label: nav.doctor },
  { href: "/settings", label: nav.settings },
] as const;

/** Section links for signed-in pages: inline in the header from `sm`, a bottom bar on phones. */
export function AppNav({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname();
  return (
    <div
      className={cn(
        mobile
          ? "fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-page/95 px-2 py-2 backdrop-blur-md sm:hidden"
          : "hidden items-center gap-1 sm:flex",
      )}
    >
      {links.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-meta font-semibold transition-colors sm:px-3",
              active ? "bg-surface-muted text-ink" : "text-subtle hover:bg-surface-muted hover:text-ink",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
