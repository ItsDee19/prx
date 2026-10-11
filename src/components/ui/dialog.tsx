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

const SIZES: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  size?: DialogSize;
}

/**
 * Portal + overlay + centred panel with a header (title, optional description)
 * and a close button. The body scrolls when taller than the viewport.
 */
export function DialogContent({ title, description, children, className, size = "md" }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
          "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        )}
      />
      <DialogPrimitive.Content
        // Without a description, tell Radix explicitly so it does not warn about aria-describedby.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
          "overflow-y-auto rounded-xl border border-border bg-surface shadow-xl outline-none",
          "data-[state=open]:animate-zoom-in data-[state=closed]:animate-zoom-out",
          SIZES[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-base font-semibold leading-6 tracking-tight text-fg">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-fg-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon" className="-mr-2 -mt-2 size-8" aria-label="Close">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>
        <div className="px-6 pb-6 pt-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end", className)}
      {...props}
    />
  );
}
