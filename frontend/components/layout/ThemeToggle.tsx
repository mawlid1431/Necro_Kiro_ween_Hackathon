"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export const THEME_KEY = "necro.theme";

/** Runs before first paint (inline in <head>) so a dark page never flashes white. Light is the default. */
export const themeScript = `try{if(localStorage.getItem("${THEME_KEY}")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const isDark = () => document.documentElement.classList.contains("dark");

/** Light / dark switch for the header. The choice is remembered in this browser. */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  function toggle() {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // private window: the choice lasts for this visit only
    }
    listeners.forEach((fn) => fn());
  }
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn("grid size-9 place-items-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-surface-muted", className)}
    >
      {dark ? <Sun aria-hidden className="size-4" strokeWidth={1.75} /> : <Moon aria-hidden className="size-4" strokeWidth={1.75} />}
    </button>
  );
}
