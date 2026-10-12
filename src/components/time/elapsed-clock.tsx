"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/duration";
import { cn } from "@/lib/utils";

/**
 * The current time in ms, ticking every second, or null until mounted. The
 * server render and the first client render agree (null), so the ticking
 * clock never causes a hydration mismatch.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const handle = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(handle);
  }, [intervalMs]);
  return now;
}

export interface ElapsedClockProps {
  /** ISO timestamp the timer started at. */
  startedAt: string;
  className?: string;
}

/** Live "04:05" / "1:04:05" since `startedAt` in Geist Mono; "--:--" until mounted. */
export function ElapsedClock({ startedAt, className }: ElapsedClockProps) {
  const now = useNow();
  const text = now === null ? "--:--" : formatElapsed(now - Date.parse(startedAt));
  return (
    <span role="timer" aria-live="off" className={cn("font-mono tabular-nums", className)}>
      {text}
    </span>
  );
}

/** Pulsing "running" dot (static with reduced motion). */
export function RunningDot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative flex size-2 shrink-0", className)}>
      <span className="absolute inline-flex size-full animate-pulse-soft rounded-full bg-success/60" />
      <span className="relative inline-flex size-2 rounded-full bg-success" />
    </span>
  );
}
