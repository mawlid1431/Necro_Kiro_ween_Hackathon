"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { Menu, X } from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { OmenNotifier } from "@/components/omens/Omens";
import { connectors, nav, witching } from "@/lib/copy";
import { cn } from "@/lib/utils";

// Six sections. Home (the dashboard) is the logo. Doctor is a tab of the Graveyard, Grimoire a tab of Omens, Connectors a section of Settings.
const links = [
  { href: "/graveyard", label: nav.graveyard },
  { href: "/crypt", label: nav.crypt },
  { href: "/discover", label: nav.discover },
  { href: "/omens", label: nav.omens },
  { href: "/calendar", label: nav.calendar },
  { href: "/settings", label: nav.settings },
] as const;

/** Shows a browser notification when a scheduled reminder comes due (if the user allowed notifications). */
function ReminderNotifier() {
  const due = useQuery(api.social.dueReminders, {});
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!due) return;
    const ids = new Set(due.map((d) => d._id as string));
    if (seen.current === null) {
      seen.current = ids; // already due when the page opened: the badge shows them, no popup
      return;
    }
    const canNotify = "Notification" in window && Notification.permission === "granted";
    for (const d of due) {
      if (seen.current.has(d._id)) continue;
      if (canNotify) new Notification(witching.notifyTitle, { body: witching.notifyBody(d.itemTitle, connectors.names[d.platform]), tag: d._id });
    }
    seen.current = ids;
  }, [due]);
  return null;
}

function NavLinks({ vertical, onPick }: { vertical?: boolean; onPick?: () => void }) {
  const path = usePathname();
  const unseen = useQuery(api.omens.unseenCount, {});
  const due = useQuery(api.social.dueReminders, {})?.length ?? 0;
  return links.map((l) => {
    const active = path === l.href || path.startsWith(`${l.href}/`);
    return (
      <Link
        key={l.href}
        href={l.href}
        onClick={onPick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "rounded-md font-semibold whitespace-nowrap transition-colors",
          vertical ? "flex items-center px-3 py-2 text-meta" : "px-2 py-1.5 text-meta xl:px-3",
          active ? "bg-surface-muted text-ink" : "text-subtle hover:bg-surface-muted hover:text-ink",
        )}
      >
        {l.label}
        {l.href === "/omens" && unseen ? (
          <span aria-label={`${unseen} new`} className="ml-1 rounded-full bg-ecto px-1.5 py-px text-[0.6875rem] leading-4 font-bold text-ink">
            {unseen >= 99 ? "99+" : unseen}
          </span>
        ) : null}
        {l.href === "/calendar" && due ? (
          <span aria-label={`${due} due`} className="ml-1 rounded-full bg-amber-400 px-1.5 py-px text-[0.6875rem] leading-4 font-bold text-amber-950">
            {due}
          </span>
        ) : null}
      </Link>
    );
  });
}

/** Section links for signed-in pages: inline in the header from `md`, a compact menu on phones. */
export function AppNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Close when the page changes (a link was followed by any means).
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) {
    setLastPath(path);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    panel.current?.querySelector("a")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <>
      <OmenNotifier />
      <ReminderNotifier />
      <div className="hidden items-center gap-0.5 md:flex">
        <NavLinks />
      </div>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="app-menu"
        aria-label={open ? nav.closeMenu : nav.openMenu}
        className="grid size-10 place-items-center rounded-md text-ink transition-colors hover:bg-surface-muted md:hidden"
      >
        {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
      </button>
      {open ? (
        <div
          ref={panel}
          id="app-menu"
          className="fixed top-[3.75rem] right-4 z-50 flex max-h-[calc(100dvh-5rem)] w-52 flex-col gap-0.5 overflow-y-auto rounded-lg border border-line bg-page p-1.5 shadow-lg md:hidden"
        >
          <NavLinks vertical onPick={() => setOpen(false)} />
        </div>
      ) : null}
    </>
  );
}
