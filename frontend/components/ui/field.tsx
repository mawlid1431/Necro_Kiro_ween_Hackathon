import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border-[1.5px] border-line bg-surface px-3 text-body text-ink placeholder:text-subtle/70 focus-visible:border-ecto-dim focus-visible:outline-none disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
}

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block">
      <span className="text-meta font-semibold text-ink">{children}</span>
      {hint ? <span className="mt-0.5 block text-meta text-subtle">{hint}</span> : null}
    </label>
  );
}

/** Inline status line for form results: role="status" so screen readers announce it. */
export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md px-3 py-2 text-meta font-medium",
        tone === "error" && "bg-danger/10 text-danger",
        tone === "ok" && "bg-ecto/15 text-ecto-ink",
        tone === "info" && "bg-surface-muted text-copy",
      )}
    >
      {children}
    </p>
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-surface p-5 sm:p-6", className)} {...props} />;
}
