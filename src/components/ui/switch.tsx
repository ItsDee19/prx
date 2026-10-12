"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  /** Needed when no <label htmlFor={id}> names the switch. */
  "aria-label"?: string;
  className?: string;
}

/**
 * On/off toggle (radix Switch, `role="switch"`). The thumb glides with a
 * slight spring; on touch screens an invisible 40px hit area surrounds it.
 */
export function Switch({ checked, onCheckedChange, disabled, id, "aria-label": ariaLabel, className }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "group/switch relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 outline-none",
        // The off track uses the input-border token: 3:1 against the page in both themes.
        "bg-input-border shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)] transition-[background-color,box-shadow] duration-(--dur-2) ease-out-quart",
        "hover:bg-fg-muted data-[state=checked]:bg-accent data-[state=checked]:hover:bg-accent-hover",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-2.5",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25),0_0_0_0.5px_rgb(0_0_0/0.06)]",
          "transition-transform duration-(--dur-3) ease-spring will-change-transform",
          "translate-x-0 data-[state=checked]:translate-x-4",
          "group-active/switch:scale-x-110",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
