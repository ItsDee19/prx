"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/types";
import { Brand } from "./brand";
import { ThemeSwitchButton } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export interface TopbarProps {
  user: User;
  onOpenMenu: () => void;
}

/** Mobile/tablet header: hamburger, wordmark and the account menu. Hidden at lg and up. */
export function Topbar({ user, onOpenMenu }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:px-4 lg:hidden">
      <Button variant="ghost" size="icon" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu />
      </Button>
      <Brand href="/dashboard" size="sm" showCaption={false} className="ml-1" />
      <div className="ml-auto flex items-center gap-1">
        <ThemeSwitchButton />
        <UserMenu user={user} compact />
      </div>
    </header>
  );
}
