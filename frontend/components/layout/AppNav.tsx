"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { OmenNotifier } from "@/components/omens/Omens";
import { nav } from "@/lib/copy";
import { cn } from "@/lib/utils";

const links = [
  { href: "/graveyard", label: nav.graveyard },
  { href: "/crypt", label: nav.crypt },
  { href: "/discover", label: nav.discover },
  { href: "/omens", label: nav.omens },
  { href: "/doctor", label: nav.doctor },
  { href: "/settings", label: nav.settings },
] as const;

/** Section links for signed-in pages: inline in the header from `sm`, a bottom bar on phones. */
export function AppNav({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname();
  const unseen = useQuery(api.omens.unseenCount, {});
  return (
    <div
      className={cn(
        mobile
          ? "fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-page/95 px-2 py-2 backdrop-blur-md sm:hidden"
          : "hidden items-center gap-1 sm:flex",
      )}
    >
      {mobile ? null : <OmenNotifier />}
      {links.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // Six links share a phone's bottom bar, so they are tighter there.
              "rounded-md py-1.5 font-semibold whitespace-nowrap transition-colors",
              mobile ? "px-1.5 text-[0.75rem]" : "px-3 text-meta",
              active ? "bg-surface-muted text-ink" : "text-subtle hover:bg-surface-muted hover:text-ink",
            )}
          >
            {l.label}
            {l.href === "/omens" && unseen ? (
              <span aria-label={`${unseen} new`} className="ml-1 rounded-full bg-ecto px-1.5 py-px text-[0.6875rem] leading-4 font-bold text-ink">
                {unseen >= 99 ? "99+" : unseen}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
