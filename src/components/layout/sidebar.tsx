"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { navSections } from "@/lib/constants";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { UserMenu } from "./user-menu";

/** True when `pathname` is the nav item's page or one of its sub-pages. */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface SidebarProps {
  user: User;
  /** Called after a nav link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void;
  /** Extra control at the end of the header row (the drawer's close button). */
  headerAction?: ReactNode;
  /** Sections rendered under the NAV groups (the SidebarExtra slot). */
  extra?: ReactNode;
  /**
   * Prefix for the nav heading ids. The sidebar renders twice below lg (rail +
   * drawer), so each instance needs its own; a fixed string (not useId) keeps
   * the server and client ids identical whatever renders around the sidebar.
   */
  idPrefix?: string;
  className?: string;
}

/**
 * Brand, the grouped navigation (`navSections`: enabled items only, admin
 * items for admins), the extra slot and the account menu. The active item gets
 * the accent tint and a 2px brand-gradient bar that grows in on navigation.
 */
export function Sidebar({ user, onNavigate, headerAction, extra, idPrefix = "sidebar", className }: SidebarProps) {
  const pathname = usePathname();
  const sections = navSections(user.role === "admin");

  return (
    <aside className={cn("flex h-full w-full flex-col", className)}>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 pl-4 pr-2">
        <Brand href="/dashboard" onClick={onNavigate} className="min-w-0" />
        {headerAction ? <div className="flex shrink-0 items-center gap-1">{headerAction}</div> : null}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-1">
        <div className="space-y-5">
          {sections.map(({ group, items }) => {
            const headingId = `${idPrefix}-nav-${group.id}`;
            return (
              <div key={group.id}>
                <p id={headingId} className="mb-1 px-3 text-[11px] font-medium leading-4 text-fg-muted">
                  {group.label}
                </p>
                <ul aria-labelledby={headingId} className="space-y-0.5">
                  {items.map((item) => {
                    const active = isNavActive(pathname, item.href);
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group relative flex h-9 items-center gap-3 rounded-[10px] px-3 text-sm font-medium outline-none pointer-coarse:h-10",
                            "transition-control active:scale-[0.98]",
                            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                            active
                              ? "bg-accent-soft text-accent-soft-fg"
                              : "text-fg-muted hover:bg-fg/[0.05] hover:text-fg",
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "absolute inset-y-2 left-0 w-0.5 rounded-full bg-grad-brand",
                              "origin-center transition-[scale,opacity] duration-(--dur-3) ease-out-expo",
                              active ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
                            )}
                          />
                          <Icon
                            name={item.icon}
                            className={cn(
                              "size-4 transition-colors duration-(--dur-2)",
                              active ? "text-accent-soft-fg" : "text-fg-subtle group-hover:text-fg-muted",
                            )}
                          />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        {extra}
      </nav>

      <div className="shrink-0 border-t border-border p-2">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
