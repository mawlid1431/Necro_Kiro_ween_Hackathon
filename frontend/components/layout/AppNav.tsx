"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { DropdownMenu } from "radix-ui";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  Compass,
  LayoutDashboard,
  Link2,
  Mail,
  Menu,
  Plus,
  Radar,
  Rss,
  Settings,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { api } from "@backend/convex/_generated/api";
import { OmenNotifier } from "@/components/omens/Omens";
import { connectors, nav, witching } from "@/lib/copy";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
type Sub = { href: string; label: string; hint: string; icon: Icon };
type Item = { key: string; label: string; href: string; icon: Icon; children?: Sub[]; badge?: "omens" | "due" };

// Five places plus Settings: related pages share a small menu, so the bar stays short and calm.
const ITEMS: Item[] = [
  { key: "dashboard", label: nav.home, href: "/dashboard", icon: LayoutDashboard },
  {
    key: "graveyard",
    label: nav.graveyard,
    href: "/graveyard",
    icon: Rss,
    children: [
      { href: "/graveyard", label: nav.menuFeeds, hint: nav.menuFeedsHint, icon: Rss },
      { href: "/discover", label: nav.discover, hint: nav.menuDiscoverHint, icon: Compass },
      { href: "/graveyard?tab=doctor", label: nav.menuDoctor, hint: nav.menuDoctorHint, icon: Stethoscope },
    ],
  },
  { key: "crypt", label: nav.crypt, href: "/crypt", icon: BookOpen },
  { key: "circle", label: nav.circle, href: "/circle", icon: Users },
  {
    key: "omens",
    label: nav.omens,
    href: "/omens",
    icon: Radar,
    badge: "omens",
    children: [
      { href: "/omens", label: nav.menuAlerts, hint: nav.menuAlertsHint, icon: Radar },
      { href: "/omens?tab=grimoire", label: nav.menuGrimoire, hint: nav.menuGrimoireHint, icon: Mail },
    ],
  },
  {
    key: "calendar",
    label: nav.calendar,
    href: "/calendar",
    icon: CalendarDays,
    badge: "due",
    children: [
      { href: "/calendar", label: nav.menuCalendar, hint: nav.menuCalendarHint, icon: CalendarDays },
      { href: "/calendar?compose=1", label: nav.menuNewPost, hint: nav.menuNewPostHint, icon: Plus },
      { href: "/settings#connections", label: nav.menuAccounts, hint: nav.menuAccountsHint, icon: Link2 },
    ],
  },
];

/** Which top item owns the current page (Discover belongs to the Graveyard; Settings is the gear). */
function activeKey(path: string): string | null {
  if (path.startsWith("/dashboard")) return "dashboard";
  if (path.startsWith("/crypt")) return "crypt";
  if (path.startsWith("/circle")) return "circle";
  if (path.startsWith("/graveyard") || path.startsWith("/discover")) return "graveyard";
  if (path.startsWith("/omens")) return "omens";
  if (path.startsWith("/calendar")) return "calendar";
  return null;
}

/** Is this menu link the page you are on? Compares the path and the ?tab / ?compose that pick a view. */
function isCurrent(href: string, path: string, params: URLSearchParams): boolean {
  const [base, query = ""] = href.split("#")[0].split("?");
  if (href.includes("#")) return false;
  if (path !== base) return false;
  const want = new URLSearchParams(query);
  for (const k of ["tab", "compose"]) if ((want.get(k) ?? "") !== (params.get(k) ?? "")) return false;
  return true;
}

function useBadges() {
  const unseen = useQuery(api.omens.unseenCount, {}) ?? 0;
  const due = useQuery(api.social.dueReminders, {})?.length ?? 0;
  return { omens: unseen, due };
}

function Badge({ n, tone }: { n: number; tone: "omens" | "due" }) {
  if (!n) return null;
  return (
    <span
      aria-label={tone === "due" ? `${n} due` : `${n} new`}
      className={cn("ml-1 rounded-full px-1.5 py-px text-[0.6875rem] leading-4 font-bold", tone === "due" ? "bg-amber-400 text-amber-950" : "bg-ecto text-on-ecto")}
    >
      {n >= 99 ? "99+" : n}
    </span>
  );
}

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

const topLink = (active: boolean) =>
  cn(
    "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-meta font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "bg-surface-muted text-ink" : "text-subtle hover:bg-surface-muted hover:text-ink",
  );

/** Desktop: plain links, and small menus (with a one-line hint each) for the groups. */
function DesktopNav() {
  const path = usePathname();
  const current = activeKey(path);
  const badges = useBadges();
  return (
    <div className="hidden items-center gap-0.5 lg:flex">
      {ITEMS.map((it) => {
        const active = current === it.key;
        const badge = it.badge ? <Badge n={badges[it.badge]} tone={it.badge} /> : null;
        if (!it.children) {
          return (
            <Link key={it.key} href={it.href} aria-current={active ? "page" : undefined} className={topLink(active)}>
              {it.label}
              {badge}
            </Link>
          );
        }
        return (
          <DropdownMenu.Root key={it.key} modal={false}>
            <DropdownMenu.Trigger className={topLink(active)}>
              {it.label}
              {badge}
              <ChevronDown aria-hidden className="size-3.5 opacity-70" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" sideOffset={8} className="z-50 w-72 rounded-xl border border-line bg-page p-1.5 shadow-lg">
                {it.children.map((c) => (
                  <DropdownMenu.Item key={c.href} asChild>
                    <Link href={c.href} className="flex items-start gap-3 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-surface-muted">
                      <c.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ecto-ink" strokeWidth={1.75} />
                      <span>
                        <span className="block text-meta font-semibold text-ink">{c.label}</span>
                        <span className="block text-[0.75rem] text-subtle">{c.hint}</span>
                      </span>
                    </Link>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        );
      })}
      <Link href="/settings" aria-label={nav.settings} title={nav.settings} className={cn(topLink(path.startsWith("/settings")), "px-2")}>
        <Settings aria-hidden className="size-4" strokeWidth={1.75} />
      </Link>
    </div>
  );
}

/** Phones: one compact menu, grouped with headings. */
function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const params = useSearchParams();
  const badges = useBadges();
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Close when the page changes (a link was followed by any means).
  const where = `${path}?${params.toString()}`;
  const [lastWhere, setLastWhere] = useState(where);
  if (lastWhere !== where) {
    setLastWhere(where);
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
    // The page behind stays still while the menu is open.
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      document.body.style.overflow = before;
    };
  }, [open]);

  const anyBadge = badges.omens + badges.due;
  const row = (href: string, label: string, Icon: Icon, extra?: ReactNode) => {
    const here = isCurrent(href, path, params);
    return (
      <Link
        key={href + label}
        href={href}
        onClick={() => setOpen(false)}
        aria-current={here ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-lg px-3 text-body font-semibold transition-colors",
          here ? "bg-ecto/25 text-ink" : "text-ink hover:bg-surface-muted",
        )}
      >
        <Icon aria-hidden className="size-[1.125rem] shrink-0 text-ecto-ink" strokeWidth={1.75} />
        <span className="flex-1">{label}</span>
        {extra}
      </Link>
    );
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="app-menu"
        aria-label={open ? nav.closeMenu : nav.openMenu}
        className="relative grid size-11 place-items-center rounded-lg text-ink transition-colors hover:bg-surface-muted lg:hidden"
      >
        {open ? <X aria-hidden className="size-6" /> : <Menu aria-hidden className="size-6" />}
        {!open && anyBadge ? <span aria-hidden className="absolute top-2 right-2 size-2.5 rounded-full bg-amber-400 ring-2 ring-page" /> : null}
      </button>
      {open ? <div aria-hidden className="fixed inset-x-0 top-16 bottom-0 z-40 bg-ink/30 backdrop-blur-[2px] lg:hidden" /> : null}
      {open ? (
        <div
          ref={panel}
          id="app-menu"
          className="fixed inset-x-0 top-16 z-50 flex max-h-[calc(100dvh-4rem)] flex-col gap-0.5 overflow-y-auto overscroll-contain border-b border-line bg-page p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg sm:inset-x-auto sm:top-[4.25rem] sm:right-6 sm:w-80 sm:max-h-[calc(100dvh-5rem)] sm:rounded-xl sm:border lg:hidden"
        >
          {ITEMS.map((it, i) =>
            it.children ? (
              <div key={it.key} className="mt-1 border-t border-line pt-1">
                <p className="px-3 pt-2 pb-1 text-overline font-bold text-subtle uppercase">
                  {it.label}
                  {it.badge ? <Badge n={badges[it.badge]} tone={it.badge} /> : null}
                </p>
                {it.children.map((c) => row(c.href, c.label, c.icon))}
              </div>
            ) : ITEMS[i - 1]?.children ? (
              <div key={it.key} className="mt-1 border-t border-line pt-1">
                {row(it.href, it.label, it.icon)}
              </div>
            ) : (
              row(it.href, it.label, it.icon)
            ),
          )}
          <div className="mt-1 border-t border-line pt-1">{row("/settings", nav.settings, Settings)}</div>
        </div>
      ) : null}
    </>
  );
}

/** Signed-in navigation: four places and Settings, grouped so the bar stays short. */
export function AppNav() {
  return (
    <>
      <OmenNotifier />
      <ReminderNotifier />
      <DesktopNav />
      <MobileNav />
    </>
  );
}
