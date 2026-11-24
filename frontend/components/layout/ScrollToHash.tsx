"use client";

import { useEffect } from "react";

/**
 * Signed-in pages render their sections after sign-in finishes, so the browser's own jump to
 * "#keys" happens before the target exists. This waits (up to 5 s) for it, then scrolls once.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "start" });
        clearInterval(timer);
      } else if (Date.now() - started > 5000) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, []);
  return null;
}
