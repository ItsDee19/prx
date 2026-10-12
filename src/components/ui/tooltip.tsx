"use client";

import type { ReactElement, ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** Mount once in the root layout. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={250}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export interface TooltipProps {
  content: ReactNode;
  /** A single element that can receive a ref and props (rendered via `asChild`). */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
}

export function Tooltip({ content, children, side = "top", align = "center", className }: TooltipProps) {
  // Nothing to say: render the trigger alone so callers can pass optional content.
  if (content === null || content === undefined || content === "") return children;

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 select-none rounded-lg bg-fg px-2.5 py-1.5 text-xs font-medium text-bg shadow-pop [overflow-wrap:anywhere]",
            "origin-(--radix-tooltip-content-transform-origin)",
            "max-w-[min(20rem,calc(100vw-1rem),var(--radix-tooltip-content-available-width,100vw))]",
            "data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in data-[state=closed]:animate-fade-out",
            className,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
