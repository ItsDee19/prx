"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export type DialogSize = "sm" | "md" | "lg";

/* Panel widths apply from `sm` up; below that the dialog is a full-width bottom sheet. */
const SIZES: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

export interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  size?: DialogSize;
}

/**
 * Portal + overlay + panel with a header (title, optional description) and a
 * close button. The header stays put and the body scrolls when the content is
 * taller than the panel.
 *
 * - Below `sm` the panel is a bottom sheet: full width, rounded top corners,
 *   at most 85dvh tall, padded clear of the home indicator, sliding up.
 * - From `sm` up it is a centred modal (fade + zoom), at most 90dvh tall.
 *
 * The modal is centred with `inset-0 m-auto h-fit` (how the browser centres a
 * native <dialog>), never with `left-1/2 -translate-x-1/2`: an untransformed
 * fixed box that starts at 50% pokes past the right edge of a narrow phone,
 * which makes mobile browsers widen the layout viewport and Radix's scroll
 * lock then pads <body> by the bogus "scrollbar" width.
 */
export function DialogContent({ title, description, children, className, size = "md" }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-overlay backdrop-blur-[3px]",
          "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        )}
      />
      <DialogPrimitive.Content
        // Without a description, tell Radix explicitly so it does not warn about aria-describedby.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          // Glass panel (solid surface with reduced transparency), 20px radius.
          "fixed z-50 flex flex-col overflow-hidden border-glass-border glass-panel text-fg shadow-pop outline-none",
          // Phones: bottom sheet.
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[20px] border-t pb-[env(safe-area-inset-bottom)]",
          "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out",
          // sm and up: centred modal.
          "sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:rounded-[20px] sm:border sm:pb-0",
          "sm:data-[state=open]:animate-zoom-in sm:data-[state=closed]:animate-zoom-out",
          SIZES[size],
          className,
        )}
      >
        {/* Grab handle: marks the phone bottom sheet as a layer above the page. */}
        <div aria-hidden className="flex shrink-0 justify-center pt-2 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </div>
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3 pt-3 sm:px-6 sm:pt-6">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-base font-semibold leading-6 tracking-tight text-fg [overflow-wrap:anywhere]">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-fg-muted [overflow-wrap:anywhere]">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon" className="-mr-2 -mt-1 size-8 sm:-mt-2" aria-label="Close">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>
        {/* scroll-pb: fields scrolled into view on focus stop above the sticky DialogFooter. */}
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 pt-1 scroll-pb-28 sm:px-6 sm:pb-6 sm:scroll-pb-20">
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/**
 * Action row. Render it as the last element of the dialog body (directly or as
 * the last child of a form inside it). Phones: full-width buttons stacked with
 * the primary (last) one on top. It sticks to the bottom of the scrolling body,
 * so the actions stay reachable in long forms; when the body is scrolled to the
 * end it sits in its normal place, so no field is ever hidden behind it. The
 * negative margins let it span the body's padding; the fade above it marks
 * content that continues underneath.
 */
export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Sticky insets are measured inside the scroll container's padding, hence the
        // negative bottom (= the body's bottom padding) to sit flush with the panel edge.
        // Same glass as the panel, so content scrolling underneath is blurred, not visible through it.
        "sticky -bottom-5 z-10 -mx-5 -mb-5 mt-6 flex flex-col-reverse gap-2 glass-panel px-5 pb-5",
        "sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:pb-6",
        "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-3",
        "before:bg-linear-to-t before:from-glass-panel before:to-transparent",
        className,
      )}
      {...props}
    />
  );
}
