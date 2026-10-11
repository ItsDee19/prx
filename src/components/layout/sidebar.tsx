"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, LayoutDashboard, Settings, Users, type LucideIcon } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { ThemeSwitchButton } from "./theme-toggle";
import { UserMenu } from "./user-menu";

type NavIconName = (typeof NAV_ITEMS)[number]["icon"];

const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  LayoutDashboard,
  FolderKanban,
  Users,
  Settings,
};

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface SidebarProps {
  user: User;
  /** Called after a nav link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ user, onNavigate, className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={cn("flex h-full w-full flex-col bg-surface", className)}>
      <div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-2">
        <Brand href="/dashboard" onClick={onNavigate} />
        <ThemeSwitchButton />
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            const active = isNavActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium outline-none transition-colors duration-150",
                    "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 transition-colors duration-150",
                      active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted",
                    )}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
