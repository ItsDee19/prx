"use client";

import { useEffect, useRef, useState } from "react";
import { ProgressRing, type ProgressRingProps } from "@/components/ui/progress-ring";
import { clampProgress, cn } from "@/lib/utils";

/**
 * ProgressRing that draws its arc (stroke-dashoffset, 600ms) the first time it
 * scrolls into view instead of on first paint, so rings below the fold still
 * animate when the reader reaches them. Later value changes glide as usual.
 * Without IntersectionObserver, or once seen, it renders the value directly;
 * the ring's own CSS keeps it static when motion is reduced. Assistive tech
 * always gets the real value (the wrapper is the progressbar).
 */
export function InViewRing({ className, ...props }: ProgressRingProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);
  const pct = clampProgress(props.value);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      role="progressbar"
      aria-label={props.label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${pct}%`}
      className={cn("inline-flex shrink-0", className)}
    >
      {/* Until seen the arc is not mounted (value 0); mounting it plays the draw-in animation. */}
      <span aria-hidden className="inline-flex">
        <ProgressRing {...props} value={seen ? props.value : 0} />
      </span>
    </span>
  );
}
