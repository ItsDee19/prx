"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn, dispatchAppCommand } from "@/lib/utils";

export interface CommandMenuTriggerProps {
  className?: string;
}

/**
 * Topbar search button: "Search… Ctrl K" (⌘ K on macOS) from `md`, an icon
 * button below. Opens the CommandPalette through the `open-palette` command.
 */
export function CommandMenuTrigger({ className }: CommandMenuTriggerProps) {
  return (
    <Button
      variant="outline"
      onClick={() => dispatchAppCommand({ type: "open-palette" })}
      aria-keyshortcuts="Control+K Meta+K"
      aria-haspopup="dialog"
      className={cn(
        "size-9 px-0 font-normal text-fg-muted shadow-none hover:text-fg",
        "md:h-9 md:w-56 md:justify-start md:gap-2 md:pl-3 md:pr-1.5 lg:w-64",
        className,
      )}
    >
      <Search aria-hidden />
      <span className="sr-only md:not-sr-only md:flex-1 md:truncate md:text-left">Search…</span>
      <Kbd keys="mod+k" className="hidden md:inline-flex" />
    </Button>
  );
}
