"use client";

import type { ReactNode } from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/**
 * Shared item look: highlight follows keyboard focus and pointer hover.
 * Touch screens get 40px-tall rows so every menu item is easy to tap.
 */
const ITEM_CLASS =
  "relative flex cursor-default select-none items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-fg outline-none pointer-coarse:py-2.5 " +
  "transition-colors duration-(--dur-1) " +
  // A tint of the foreground reads as a highlight on light and dark glass alike.
  "data-[highlighted]:bg-fg/[0.07] data-[highlighted]:text-fg " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 " +
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted";

export type DropdownMenuContentProps = DropdownMenuPrimitive.DropdownMenuContentProps;

/** Gap kept between a menu and the screen edges. */
const COLLISION_PADDING = 8;

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
        collisionPadding={COLLISION_PADDING}
        className={cn(
          // Floating chrome: glass panel, 14px radius, pop shadow.
          "z-50 min-w-[10rem] overflow-y-auto overflow-x-hidden overscroll-contain rounded-[14px] border border-glass-border glass-panel p-1 text-fg shadow-pop",
          // Never wider or taller than the room Radix measured inside the collision padding:
          // long menus scroll instead of running off a phone screen.
          "max-h-(--radix-dropdown-menu-content-available-height) max-w-[min(calc(100vw-1rem),var(--radix-dropdown-menu-content-available-width,100vw))]",
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
          "text-danger data-[highlighted]:bg-danger/12 data-[highlighted]:text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <DropdownMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-fg/[0.08]", className)} />;
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
