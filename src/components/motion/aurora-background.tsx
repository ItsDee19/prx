"use client";

import { useEffect, useRef } from "react";

/**
 * The single ambient layer behind the app: a 1px grid of 32px cells masked to
 * the top of the screen and three soft glows drifting on a 24s transform-only
 * loop. Fixed, behind everything (`-z-10` inside an isolated parent), never
 * interactive. The drift pauses while the tab is hidden and is static with
 * reduced motion (via the --anim-aurora-* tokens in globals.css).
 */
export function AuroraBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const sync = () => element.toggleAttribute("data-paused", document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return (
    <div ref={ref} aria-hidden className="aurora">
      <div className="aurora-glow aurora-glow-1" />
      <div className="aurora-glow aurora-glow-2" />
      <div className="aurora-glow aurora-glow-3" />
      <div className="aurora-grid" />
    </div>
  );
}
