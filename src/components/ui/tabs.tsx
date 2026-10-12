"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { IconName } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

/* ------------------------------------------------------------------ */
/* Shared look                                                         */
/* ------------------------------------------------------------------ */

/**
 * The scrolling row whose divider the active tab's bar sits on. The divider is
 * an inset shadow (not a border) so the bar can cover it while staying inside
 * the row: nothing may poke out below, or the sideways-scrolling row (which
 * forces `overflow-y` to scroll too) would grow a 1px vertical scrollbar.
 */
const LIST_CLASS =
  "relative flex min-w-0 max-w-full items-stretch gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain pointer-coarse:scrollbar-none " +
  "shadow-[inset_0_-1px_0_var(--border)] [-webkit-overflow-scrolling:touch]";

/**
 * One tab. `data-active` (links) or radix's `data-state=active` mark the
 * current tab; the accent bar grows from the centre on activation.
 */
const TRIGGER_CLASS =
  "group/tab relative inline-flex h-10 shrink-0 select-none items-center gap-2 whitespace-nowrap rounded-t-[10px] px-3 " +
  "text-sm font-medium text-fg-muted outline-none transition-colors duration-(--dur-2) ease-out-quart " +
  "hover:text-fg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "data-[state=active]:text-fg data-[active=true]:text-fg " +
  // Active bar: scaled, never resized, so the change is transform-only.
  "after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent " +
  "after:scale-x-0 after:opacity-0 after:transition-[scale,opacity] after:duration-(--dur-3) after:ease-out-expo " +
  "data-[state=active]:after:scale-x-100 data-[state=active]:after:opacity-100 " +
  "data-[active=true]:after:scale-x-100 data-[active=true]:after:opacity-100 " +
  "pointer-coarse:h-11";

function TabLabel({ icon, count, children }: { icon?: IconName; count?: number | null; children: ReactNode }) {
  return (
    <>
      {icon ? (
        <Icon
          name={icon}
          className="size-4 text-fg-subtle transition-colors duration-(--dur-2) group-hover/tab:text-fg-muted group-data-[state=active]/tab:text-accent group-data-[active=true]/tab:text-accent"
        />
      ) : null}
      <span>{children}</span>
      {count !== undefined && count !== null ? (
        <span
          className={cn(
            "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-2 px-1.5",
            "text-[11px] font-semibold tabular-nums leading-none text-fg-muted",
            "group-data-[state=active]/tab:bg-accent-soft group-data-[state=active]/tab:text-accent-soft-fg",
            "group-data-[active=true]/tab:bg-accent-soft group-data-[active=true]/tab:text-accent-soft-fg",
          )}
        >
          {count > 999 ? "999+" : count}
        </span>
      ) : null}
    </>
  );
}

/**
 * Scrolls a horizontally overflowing tab row so `active` is in view, without
 * ever scrolling the page itself (no scrollIntoView).
 */
function revealActiveTab(list: HTMLElement | null, active: HTMLElement | null) {
  if (!list || !active || list.scrollWidth <= list.clientWidth) return;
  const listBox = list.getBoundingClientRect();
  const tabBox = active.getBoundingClientRect();
  const offset = tabBox.left - listBox.left + list.scrollLeft;
  const target = offset - (list.clientWidth - tabBox.width) / 2;
  list.scrollLeft = Math.max(0, Math.min(target, list.scrollWidth - list.clientWidth));
}

/* ------------------------------------------------------------------ */
/* Radix tabs (in-page panels)                                         */
/* ------------------------------------------------------------------ */

export interface TabsProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, defaultValue, onValueChange, children, className }: TabsProps) {
  return (
    <TabsPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      className={cn("min-w-0", className)}
    >
      {children}
    </TabsPrimitive.Root>
  );
}

export interface TabsListProps {
  children: ReactNode;
  "aria-label": string;
  className?: string;
}

/** Tab row: one line, scrolls sideways on narrow screens instead of wrapping. */
export function TabsList({ children, "aria-label": ariaLabel, className }: TabsListProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the selected tab visible in a scrolled row (initially and after keyboard moves).
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const sync = () => revealActiveTab(list, list.querySelector<HTMLElement>('[data-state="active"]'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-state"] });
    return () => observer.disconnect();
  }, []);

  return (
    <TabsPrimitive.List ref={ref} aria-label={ariaLabel} className={cn(LIST_CLASS, className)}>
      {children}
    </TabsPrimitive.List>
  );
}

export interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  icon?: IconName;
  /** Small count pill after the label; null/undefined hides it. */
  count?: number | null;
  disabled?: boolean;
  className?: string;
}

export function TabsTrigger({ value, children, icon, count, disabled, className }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger value={value} disabled={disabled} className={cn(TRIGGER_CLASS, className)}>
      <TabLabel icon={icon} count={count}>
        {children}
      </TabLabel>
    </TabsPrimitive.Trigger>
  );
}

export interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      value={value}
      className={cn(
        "mt-4 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "data-[state=active]:animate-fade-in",
        className,
      )}
    >
      {children}
    </TabsPrimitive.Content>
  );
}

/* ------------------------------------------------------------------ */
/* Link tabs (URL state, server-friendly)                              */
/* ------------------------------------------------------------------ */

export interface TabLinkItem {
  id: string;
  label: string;
  href: string;
  icon?: IconName;
  count?: number | null;
}

export interface TabLinksProps {
  items: TabLinkItem[];
  activeId: string;
  "aria-label": string;
  className?: string;
}

/**
 * The tab look rendered as navigation links (`aria-current="page"` on the
 * active one). Use it where the tab lives in the URL, e.g. `?tab=` on the
 * project page; only the active tab's content is rendered by the server.
 */
export function TabLinks({ items, activeId, "aria-label": ariaLabel, className }: TabLinksProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    revealActiveTab(list, list?.querySelector<HTMLElement>('[aria-current="page"]') ?? null);
  }, [activeId]);

  return (
    <nav aria-label={ariaLabel} className={cn("min-w-0", className)}>
      <ul ref={listRef} role="list" className={LIST_CLASS}>
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} className="flex shrink-0">
              <Link
                href={item.href}
                scroll={false}
                aria-current={active ? "page" : undefined}
                data-active={active}
                className={TRIGGER_CLASS}
              >
                <TabLabel icon={item.icon} count={item.count}>
                  {item.label}
                </TabLabel>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
