"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import {
  getUnreadCountAction,
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationsReadAction,
} from "@/actions/notifications";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { MOTION, NOTIFICATION_POLL_MS, NOTIFICATION_POPOVER_LIMIT } from "@/lib/constants";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { safeTimeZone, workspaceToday } from "@/lib/workspace-time";
import { NotificationItem } from "./notification-item";
import { emitNotificationsChanged, groupTodayEarlier, subscribeNotificationsChanged } from "./notification-utils";

export interface NotificationBellProps {
  /** `countUnread(user.id)` from the server. */
  initialUnread: number;
  /** Workspace timezone for the Today / Earlier split (defaults to the browser's). */
  timeZone?: string;
  className?: string;
}

/** One-time bell wiggle when new unread notifications arrive. */
const WIGGLE = { rotate: [0, -16, 13, -9, 6, -3, 0] };
const WIGGLE_TRANSITION = { duration: 0.6, ease: MOTION.ease.outQuart };
/** Spring for the badge pop (a touch bouncier than the default so it reads as a pop). */
const BADGE_SPRING = { type: "spring", visualDuration: 0.3, bounce: 0.4 } as const;

function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/**
 * Topbar bell. Polls the unread count every NOTIFICATION_POLL_MS while the tab
 * is visible, and again on focus, on navigation and when the inbox changes
 * read state. The badge (capped at 99+) pops in with a spring and the bell
 * wiggles once whenever the count goes up. Opens a glass popover with the
 * latest notifications (Today / Earlier), "Mark all read" and a link to /inbox.
 */
export function NotificationBell({ initialUnread, timeZone, className }: NotificationBellProps) {
  const pathname = usePathname();
  const reduce = useReducedMotionConfig() === true;
  const [unread, setUnread] = useState(initialUnread);
  const [wiggle, setWiggle] = useState(0);
  const previous = useRef(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [zone, setZone] = useState("UTC");
  const [marking, startMarking] = useTransition();

  const applyCount = useCallback((count: number) => {
    if (count > previous.current) setWiggle((value) => value + 1);
    previous.current = count;
    setUnread(count);
  }, []);

  const refreshCount = useCallback(async () => {
    const result = await getUnreadCountAction();
    if (result.ok) applyCount(result.data);
  }, [applyCount]);

  const loadItems = useCallback(async () => {
    setLoadError(null);
    const result = await listNotificationsAction({ tab: "all", limit: NOTIFICATION_POPOVER_LIMIT });
    if (result.ok) setItems(result.data);
    else setLoadError(result.error);
  }, []);

  // A fresh server render (e.g. after router.refresh()) brings a new count.
  useEffect(() => applyCount(initialUnread), [initialUnread, applyCount]);

  // Poll while visible; refresh on focus and when the tab becomes visible again.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    const timer = window.setInterval(tick, NOTIFICATION_POLL_MS);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    const unsubscribe = subscribeNotificationsChanged((source) => {
      if (source !== "bell") void refreshCount();
    });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
      unsubscribe();
    };
  }, [refreshCount]);

  // Most mutations end in a navigation or refresh; re-check after route changes.
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    void refreshCount();
  }, [pathname, refreshCount]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      const resolved = safeTimeZone(timeZone ?? browserTimeZone());
      setZone(resolved);
      setToday(workspaceToday(resolved));
      void loadItems();
      void refreshCount();
    }
  }

  function openItem(notification: AppNotification) {
    setOpen(false);
    if (notification.read_at !== null) return;
    const readAt = new Date().toISOString();
    setItems((current) => current?.map((item) => (item.id === notification.id ? { ...item, read_at: readAt } : item)) ?? null);
    applyCount(Math.max(0, unread - 1));
    void markNotificationsReadAction([notification.id]).then((result) => {
      if (result.ok) emitNotificationsChanged("bell");
      else void refreshCount();
    });
  }

  function markAll() {
    const before = items;
    const readAt = new Date().toISOString();
    setItems((current) => current?.map((item) => (item.read_at ? item : { ...item, read_at: readAt })) ?? null);
    const previousCount = unread;
    applyCount(0);
    startMarking(async () => {
      const result = await markAllNotificationsReadAction();
      if (!result.ok) {
        setItems(before);
        applyCount(previousCount);
        toast.error(result.error);
        return;
      }
      emitNotificationsChanged("bell");
    });
  }

  const groups = items && today ? groupTodayEarlier(items, today, zone) : [];
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className={cn("relative", className)}>
          <m.span
            key={wiggle}
            aria-hidden
            className="inline-flex origin-[50%_15%]"
            initial={wiggle > 0 && !reduce ? { rotate: 0 } : false}
            animate={wiggle > 0 && !reduce ? WIGGLE : { rotate: 0 }}
            transition={WIGGLE_TRANSITION}
          >
            <Bell />
          </m.span>
          {unread > 0 ? (
            <m.span
              // Re-mounts (and pops) only when the count goes up.
              key={`badge-${wiggle}`}
              aria-hidden
              initial={reduce ? false : { scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={reduce ? { duration: 0 } : BADGE_SPRING}
              className={cn(
                "pointer-events-none absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1",
                "bg-danger text-[10px] font-semibold leading-none text-danger-fg tabular-nums ring-2 ring-bg",
              )}
            >
              {badgeText(unread)}
            </m.span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <span aria-live="polite" className="sr-only">
        {unread > 0 ? `${unread} unread ${unread === 1 ? "notification" : "notifications"}` : ""}
      </span>
      <PopoverContent align="end" className="flex w-[min(24rem,calc(100vw-1rem))] flex-col p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <p className="text-sm font-semibold text-fg">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={markAll}
            disabled={unread === 0 || marking}
            className="-mr-2 text-fg-muted"
          >
            <CheckCheck aria-hidden />
            Mark all read
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
          {loadError ? (
            <div role="alert" className="px-3 py-6 text-center text-sm text-fg-muted">
              <p>{loadError}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadItems()}>
                Try again
              </Button>
            </div>
          ) : items === null ? (
            <div role="status" aria-label="Loading notifications" className="space-y-1 p-1">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex items-start gap-3 px-1.5 py-2">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <span className="mb-3 inline-flex size-10 items-center justify-center rounded-2xl border border-border bg-surface text-accent shadow-card">
                <Inbox aria-hidden className="size-5" />
              </span>
              <p className="text-sm font-semibold text-fg">You&apos;re all caught up.</p>
              <p className="mt-1 text-sm text-fg-muted">Mentions, assignments and updates land here.</p>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.key} aria-label={group.label} className="pb-1">
                <h3 className="px-2.5 pb-1 pt-2 text-xs font-medium text-fg-subtle">{group.label}</h3>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <NotificationItem notification={item} onOpen={openItem} compact />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="border-t border-border p-1.5">
          <Link
            href="/inbox"
            onClick={() => setOpen(false)}
            className={buttonVariants({ variant: "ghost", size: "sm", className: "w-full justify-center" })}
          >
            Open inbox
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
