"use client";

import type { ReactNode } from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/** Shared item look: highlight follows keyboard focus and pointer hover. */
const ITEM_CLASS =
  "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg outline-none " +
  "transition-colors duration-150 " +
  "data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 " +
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted";

export type DropdownMenuContentProps = DropdownMenuPrimitive.DropdownMenuContentProps;

export function DropdownMenuContent({
  children,
  align = "start",
  sideOffset = 6,
  className,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-50 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-lg",
          "origin-(--radix-dropdown-menu-content-transform-origin)",
          "data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out",
          className,
        )}
        {...props}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps extends DropdownMenuPrimitive.DropdownMenuItemProps {
  /** Danger styling for irreversible actions such as delete. */
  destructive?: boolean;
}

export function DropdownMenuItem({ destructive = false, className, ...props }: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        ITEM_CLASS,
        destructive &&
          "text-danger data-[highlighted]:bg-danger/10 data-[highlighted]:text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <DropdownMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} />;
}

export function DropdownMenuLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("px-2 py-1.5 text-xs font-medium text-fg-muted", className)}
    >
      {children}
    </DropdownMenuPrimitive.Label>
  );
}

export interface DropdownMenuCheckboxItemProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function DropdownMenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
  disabled,
  className,
}: DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      // Keep the menu open while toggling several filters in a row.
      onSelect={(event) => event.preventDefault()}
      className={cn(ITEM_CLASS, "pl-7", className)}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="text-accent!" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export interface DropdownMenuRadioItemProps {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function DropdownMenuRadioItem({ value, children, disabled, className }: DropdownMenuRadioItemProps) {
  return (
    <DropdownMenuPrimitive.RadioItem
      value={value}
      disabled={disabled}
      className={cn(ITEM_CLASS, "pl-7", className)}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="size-2! fill-accent text-accent!" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}
