"use client";

import type { ReactNode } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export interface PopoverContentProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  className?: string;
}

export function PopoverContent({
  children,
  align = "center",
  side = "bottom",
  sideOffset = 6,
  className,
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          // Floating chrome: glass panel, 14px radius, pop shadow.
          "z-50 w-72 rounded-[14px] border border-glass-border glass-panel p-4 text-fg shadow-pop outline-none",
          // Stay inside the screen on phones: cap to the room Radix measured and scroll if needed.
          "max-h-(--radix-popover-content-available-height) max-w-[min(calc(100vw-1rem),var(--radix-popover-content-available-width,100vw))]",
          "overflow-y-auto overscroll-contain",
          "origin-(--radix-popover-content-transform-origin)",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          className,
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
