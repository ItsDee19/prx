import { createElement, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealElement = "div" | "section" | "article" | "header" | "li" | "span" | "aside";

export interface RevealProps {
  children: ReactNode;
  /** Seconds before the element starts revealing (ignored with reduced motion). */
  delay?: number;
  /** Distance in px the element rises from (default 8). */
  y?: number;
  as?: RevealElement;
  className?: string;
}

/**
 * Fades the element in while it rises a few pixels, once, when it first
 * appears (280ms, ease-out-expo). Pure CSS: it runs from the first paint of
 * server-rendered HTML (no blank content while JavaScript loads) and never
 * replays on re-render. With reduced motion it becomes a 120ms fade.
 * Works in server and client components.
 */
export function Reveal({ children, delay = 0, y = 8, as = "div", className }: RevealProps) {
  const style = {
    "--reveal-delay": `${Math.max(0, Math.round(delay * 1000))}ms`,
    "--reveal-y": `${y}px`,
  } as CSSProperties;
  return createElement(as, { className: cn("reveal", className), style }, children);
}

export interface FadeInProps {
  children: ReactNode;
  /** Seconds before the fade starts (ignored with reduced motion). */
  delay?: number;
  /** Seconds (default 0.2). */
  duration?: number;
  as?: RevealElement;
  className?: string;
}

/** Opacity-only first-appearance fade; same rules as `Reveal`. */
export function FadeIn({ children, delay = 0, duration = 0.2, as = "div", className }: FadeInProps) {
  const style = {
    "--reveal-delay": `${Math.max(0, Math.round(delay * 1000))}ms`,
    "--reveal-duration": `${Math.max(0, Math.round(duration * 1000))}ms`,
  } as CSSProperties;
  return createElement(as, { className: cn("reveal-fade", className), style }, children);
}
