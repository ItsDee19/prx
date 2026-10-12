"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, CheckCheck, Inbox, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import {
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationsReadAction,
} from "@/actions/notifications";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import type { AppNotification, InboxTab } from "@/lib/types";
import { NotificationItem } from "./notification-item";
import { emitNotificationsChanged, groupNotificationsByDay, subscribeNotificationsChanged } from "./notification-utils";

export interface InboxListProps {
  initialItems: AppNotification[];
  tab: InboxTab;
  unreadCount: number;
  /** Workspace today and timezone (day grouping). */
  today: string;
  timeZone: string;
  /** Page size used by the server; a full page means there may be older items. */
  pageSize: number;
}

const EMPTY: Record<InboxTab, { title: string; description: string }> = {
  all: {
    title: "No notifications yet.",
    description: "Mentions, assignments and changes on projects and tasks you watch land here.",
  },
  unread: { title: "You're all caught up.", description: "Nothing unread. New notifications show up here." },
  mentions: { title: "No mentions yet.", description: "When someone @mentions you in a comment, it shows up here." },
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') !== null;
}

/**
 * The /inbox list: notifications grouped by workspace day, "Mark all read",
 * "Load older", and keyboard support — j / k move between notifications,
 * Enter opens one, e marks it read.
 */
export function InboxList({ initialItems, tab, unreadCount, today, timeZone, pageSize }: InboxListProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(unreadCount);
  const [hasMore, setHasMore] = useState(initialItems.length >= pageSize);
  const [loadingMore, startLoadingMore] = useTransition();
  const [markingAll, startMarkingAll] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // A new server render (tab switch, refresh) replaces the list.
  useEffect(() => {
    setItems(initialItems);
    setHasMore(initialItems.length >= pageSize);
  }, [initialItems, pageSize]);
  useEffect(() => setUnread(unreadCount), [unreadCount]);

  // The bell marked something read: show the server's view.
  useEffect(
    () =>
      subscribeNotificationsChanged((source) => {
        if (source === "bell") router.refresh();
      }),
    [router],
  );

  const markLocal = useCallback((ids: string[]) => {
    const readAt = new Date().toISOString();
    const set = new Set(ids);
    setItems((current) =>
      current.map((item) => (set.has(item.id) && item.read_at === null ? { ...item, read_at: readAt } : item)),
    );
  }, []);

  const markRead = useCallback(
    (notification: AppNotification, announce = false) => {
      if (notification.read_at !== null) return;
      markLocal([notification.id]);
      setUnread((count) => Math.max(0, count - 1));
      if (announce) setAnnouncement(`Marked as read: ${notification.title}`);
      void markNotificationsReadAction([notification.id]).then((result) => {
        if (!result.ok) {
          toast.error(result.error);
          router.refresh();
          return;
        }
        emitNotificationsChanged("inbox");
      });
    },
    [markLocal, router],
  );

  function markAll() {
    const before = items;
    const beforeUnread = unread;
    markLocal(items.map((item) => item.id));
    setUnread(0);
    startMarkingAll(async () => {
      const result = await markAllNotificationsReadAction();
      if (!result.ok) {
        setItems(before);
        setUnread(beforeUnread);
        toast.error(result.error);
        return;
      }
      emitNotificationsChanged("inbox");
      setAnnouncement("Marked everything as read.");
    });
  }

  function loadOlder() {
    const last = items[items.length - 1];
    if (!last) return;
    startLoadingMore(async () => {
      const result = await listNotificationsAction({ tab, before: last.created_at, limit: pageSize });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...result.data.filter((item) => !known.has(item.id))];
      });
      setHasMore(result.data.length >= pageSize);
    });
  }

  // j / k / e keyboard navigation over the rows.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "j" && event.key !== "k" && event.key !== "e") return;
      if (isTypingTarget(event.target) || dialogOpen()) return;
      const links = Array.from(listRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-inbox-link]") ?? []);
      if (links.length === 0) return;
      const current = links.findIndex((link) => link === document.activeElement);

      if (event.key === "e") {
        if (current < 0) return;
        const id = links[current].closest<HTMLElement>("[data-notification-id]")?.dataset.notificationId;
        const notification = items.find((item) => item.id === id);
        if (notification) {
          event.preventDefault();
          markRead(notification, true);
        }
        return;
      }
      event.preventDefault();
      const next = event.key === "j" ? Math.min(links.length - 1, current + 1) : Math.max(0, current < 0 ? 0 : current - 1);
      links[next].focus();
      links[next].scrollIntoView({ block: "nearest" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items, markRead]);

  const groups = groupNotificationsByDay(items, today, timeZone);
  const empty = EMPTY[tab];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted tabular-nums">
          {unread > 0 ? `${unread} unread` : "Nothing unread"}
          <span className="hidden pointer-fine:inline">
            <span aria-hidden className="mx-2 text-fg-subtle">
              ·
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
              <Kbd keys="j" /> <Kbd keys="k" /> to move, <Kbd keys="e" /> to mark read
            </span>
          </span>
        </p>
        <Button variant="outline" size="sm" onClick={markAll} loading={markingAll} disabled={unread === 0}>
          <CheckCheck aria-hidden />
          Mark all read
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={tab === "mentions" ? AtSign : tab === "unread" ? PartyPopper : Inbox}
          title={empty.title}
          description={empty.description}
        />
      ) : (
        <div ref={listRef} className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`inbox-day-${group.key}`}>
              <h2
                id={`inbox-day-${group.key}`}
                className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-fg-subtle"
              >
                {group.label}
              </h2>
              <Stagger
                as="ul"
                className="space-y-0.5 rounded-2xl border border-border bg-surface p-1 shadow-card"
              >
                {group.items.map((item) => (
                  <StaggerItem key={item.id} as="li">
                    <div data-notification-id={item.id}>
                      <NotificationItem notification={item} onOpen={(n) => markRead(n)} onMarkRead={(n) => markRead(n)} />
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          ))}
          {hasMore ? (
            <div className="flex justify-center">
              <Button variant="ghost" onClick={loadOlder} loading={loadingMore}>
                Load older
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
