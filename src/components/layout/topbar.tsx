"use client";

import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/types";
import { Brand } from "./brand";
import { ThemeSwitchButton } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export interface TopbarProps {
  user: User;
  onOpenMenu: () => void;
  /** Right-hand controls from the TopbarActions slot (search, notifications, timer). */
  actions?: ReactNode;
}

/**
 * Glass topbar on every screen size, sticky above the content (which blurs
 * as it scrolls underneath). Below lg it also carries the menu button, the
 * wordmark and the account menu (the sidebar holds them from lg).
 * With `viewportFit: cover` it extends under the status bar / notch: the top
 * inset is added to its height as padding, and the side gutters never go
 * inside a landscape notch.
 */
export function Topbar({ user, onOpenMenu, actions }: TopbarProps) {
  return (
    <header
      className={
        "glass sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 " +
        "border-b border-border/70 pt-[env(safe-area-inset-top)] " +
        "pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] " +
        "sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))] " +
        "lg:pl-8 lg:pr-[max(2rem,env(safe-area-inset-right))] 2xl:pl-10 2xl:pr-[max(2.5rem,env(safe-area-inset-right))]"
      }
    >
      <Button variant="ghost" size="icon" onClick={onOpenMenu} aria-label="Open navigation" className="lg:hidden">
        <Menu />
      </Button>
      <Brand href="/dashboard" size="sm" showCaption={false} className="ml-1 min-w-0 lg:hidden" />
      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
        {actions}
        <ThemeSwitchButton />
        <UserMenu user={user} compact className="lg:hidden" />
      </div>
    </header>
  );
}
