"use client";

import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

/** Side drawer (radix Dialog): focus trap, Escape to close, scroll lock, announced as a dialog. */
export function Sheet({ open, onOpenChange, children }: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export type SheetSize = "md" | "lg";

/* Drawer widths from `sm` up; below that the sheet spans the screen as a bottom sheet. */
const SIZES: Record<SheetSize, string> = {
  md: "sm:max-w-[520px]",
  lg: "sm:max-w-[720px]",
};

export interface SheetContentProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** Extra controls in the header, before the close button (e.g. watch, copy link, menu). */
  headerActions?: ReactNode;
  /** Pinned under the scrolling body (actions, composer). */
  footer?: ReactNode;
  size?: SheetSize;
  className?: string;
}

/**
 * Drawer panel. From `sm`: anchored to the right edge, full height, 520px
 * (`md`) or 720px (`lg`) wide but never wider than the screen, sliding in over
 * 280ms on the drawer ease. Below `sm`: a bottom sheet (at most 90dvh,
 * padded clear of the home indicator). The glass header and the optional
 * footer stay put while the body scrolls.
 */
export function SheetContent({
  title,
  description,
  children,
  headerActions,
  footer,
  size = "md",
  className,
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]",
          "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        )}
      />
      <DialogPrimitive.Content
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden bg-surface text-fg shadow-pop outline-none",
          // Phones: bottom sheet.
          "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[20px] border-t border-border pb-[env(safe-area-inset-bottom)]",
          "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
          // sm and up: right drawer.
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:max-h-none sm:w-full sm:rounded-none sm:rounded-l-[20px]",
          "sm:border-l sm:border-t-0 sm:pb-0 sm:pr-[env(safe-area-inset-right)]",
          "sm:data-[state=open]:animate-drawer-in sm:data-[state=closed]:animate-drawer-out",
          SIZES[size],
          className,
        )}
      >
        {/* Grab handle: a visual cue that the phone sheet is a layer above the page. */}
        <div aria-hidden className="flex shrink-0 justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </div>
        {/* Header and body share one scroller, so content glides under the sticky glass header;
            scroll padding keeps focused fields and #comment anchors clear of it (WCAG 2.4.11). */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pt-20 sm:scroll-pt-24">
          <div className="glass sticky top-0 z-10 flex items-start gap-3 border-b border-border/70 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-base font-semibold leading-6 tracking-tight text-fg [overflow-wrap:anywhere]">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-sm text-fg-muted [overflow-wrap:anywhere]">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <div className="-mr-2 -mt-1 flex shrink-0 items-center gap-1">
              {headerActions}
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="Close">
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className="px-5 py-4 sm:px-6 sm:py-5">{children}</div>
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-border bg-surface px-5 py-3 sm:px-6">{footer}</div>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
