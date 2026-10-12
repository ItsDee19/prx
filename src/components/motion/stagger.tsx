"use client";

import {
  Children,
  createContext,
  createElement,
  isValidElement,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MOTION } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface StaggerContextValue {
  index: number;
  /** True once the first-mount reveal is over: later items appear without animating. */
  settled: boolean;
}

const StaggerContext = createContext<StaggerContextValue | null>(null);

/** Long enough for the last staggered item (7 × 35ms delay + 280ms) to finish. */
const SETTLE_MS = Math.round(
  ((MOTION.stagger.maxItems - 1) * MOTION.stagger.step + MOTION.duration.dialog) * 1000 + 120,
);

export interface StaggerProps {
  /** `StaggerItem`s as direct children (arrays from `.map()` are fine). */
  children: ReactNode;
  as?: "div" | "ul" | "ol" | "section";
  className?: string;
}

/**
 * Staggered first-mount reveal for lists: each `StaggerItem` rises in 35ms
 * after the previous one, capped at 8 steps. It plays only when the list first
 * appears; items added later (filters, new rows) appear without animating.
 * CSS driven, so server-rendered lists animate from the first paint. With
 * reduced motion every item fades in at once (no stagger).
 */
export function Stagger({ children, as = "div", className }: StaggerProps) {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  let index = 0;
  const items = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const value: StaggerContextValue = { index, settled };
    index += 1;
    return <StaggerContext.Provider value={value}>{child}</StaggerContext.Provider>;
  });

  return createElement(as, { className }, items);
}

export interface StaggerItemProps {
  children: ReactNode;
  as?: "div" | "li" | "article" | "section";
  className?: string;
}

/** One item of a `Stagger` list. Outside a `Stagger` it renders plainly. */
export function StaggerItem({ children, as = "div", className }: StaggerItemProps) {
  const context = useContext(StaggerContext);
  const animate = context !== null && !context.settled;
  const step = context ? Math.min(context.index, MOTION.stagger.maxItems - 1) : 0;
  const style = animate
    ? ({ "--reveal-delay": `${Math.round(step * MOTION.stagger.step * 1000)}ms` } as CSSProperties)
    : undefined;
  return createElement(as, { className: cn(animate && "reveal", className), style }, children);
}
