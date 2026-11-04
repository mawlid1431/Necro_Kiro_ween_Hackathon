import type { ReactNode } from "react";
import { labels, type LabelKey } from "@/lib/copy";

/** Themed page title (Cinzel) with its plain-language subtitle, per the brand voice rules. */
export function PageTitle({ label, actions }: { label: LabelKey; actions?: ReactNode }) {
  const { themed, plain } = labels[label];
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-[1.75rem] leading-9 font-bold sm:text-h1">{themed}</h1>
        <p className="mt-1 text-meta font-medium text-subtle">{plain}</p>
      </div>
      {actions}
    </div>
  );
}
