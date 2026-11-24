"use client";

import { useEffect, useState } from "react";

/** The current minute, ticking, so time-based labels (due, expires, windows) move forward while the page stays open. */
export function useMinute(): number {
  const [m, setM] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  useEffect(() => {
    const t = setInterval(() => setM(Math.floor(Date.now() / 60_000) * 60_000), 15_000);
    return () => clearInterval(t);
  }, []);
  return m;
}
