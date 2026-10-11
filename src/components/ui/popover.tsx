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
          "z-50 w-72 rounded-lg border border-border bg-surface p-4 text-fg shadow-lg outline-none",
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
