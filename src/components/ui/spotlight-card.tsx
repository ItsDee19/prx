"use client";

import { createElement, useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SpotlightCardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  as?: "div" | "section" | "article" | "li";
  className?: string;
}

const FINE_HOVER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Card with a soft highlight that follows the pointer. The pointer position is
 * written straight to the `--x` / `--y` CSS variables (no React state, so no
 * re-renders); the glow itself is a CSS pseudo-element (`.spotlight` in
 * globals.css) shown only for fine hover pointers. Defaults to the content
 * card look (surface, border, 16px radius, card shadow); override via
 * `className`.
 */
export function SpotlightCard({ children, as = "div", className, ...rest }: SpotlightCardProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const media = window.matchMedia(FINE_HOVER_QUERY);
    let frame = 0;
    let lastEvent: PointerEvent | null = null;

    const write = () => {
      frame = 0;
      if (!lastEvent) return;
      const box = element.getBoundingClientRect();
      element.style.setProperty("--x", `${lastEvent.clientX - box.left}px`);
      element.style.setProperty("--y", `${lastEvent.clientY - box.top}px`);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      lastEvent = event;
      if (!frame) frame = window.requestAnimationFrame(write);
    };
    const attach = () => element.addEventListener("pointermove", onMove, { passive: true });
    const detach = () => element.removeEventListener("pointermove", onMove);
    const onMediaChange = () => (media.matches ? attach() : detach());

    if (media.matches) attach();
    media.addEventListener("change", onMediaChange);
    return () => {
      detach();
      media.removeEventListener("change", onMediaChange);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return createElement(
    as,
    {
      ...rest,
      ref,
      className: cn(
        "spotlight relative isolate min-w-0 rounded-2xl border border-border bg-surface shadow-card",
        className,
      ),
    },
    children,
  );
}
