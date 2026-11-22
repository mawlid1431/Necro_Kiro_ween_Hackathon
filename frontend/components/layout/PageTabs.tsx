"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Tabs for pages that hold two sections (Graveyard + Doctor, Omens + Grimoire). The tab lives in ?tab=, so links can open it. */
export function PageTabs({ label, tabs }: { label: string; tabs: { key: string; label: string; content: ReactNode }[] }) {
  const params = useSearchParams();
  const path = usePathname();
  const active = tabs.find((t) => t.key === params.get("tab"))?.key ?? tabs[0].key;
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {tabs.map((t, i) => (
          <Link
            key={t.key}
            href={i === 0 ? path : `${path}?tab=${t.key}`}
            scroll={false}
            aria-current={t.key === active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-meta font-semibold transition-colors",
              t.key === active ? "border-ecto-dim text-ink" : "border-transparent text-subtle hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tabs.find((t) => t.key === active)?.content}
    </div>
  );
}
