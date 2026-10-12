import type { BadgeTone } from "@/lib/constants";
import type { AppNotification } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { addDaysISO, dateInTimeZone } from "@/lib/workspace-time";

/**
 * window CustomEvent fired after read state changes, so the bell and the inbox
 * stay in sync without a full refresh. `detail.source` names the sender.
 */
export const NOTIFICATIONS_CHANGED_EVENT = "prx:notifications-changed";

export type NotificationsChangedSource = "bell" | "inbox";

export function emitNotificationsChanged(source: NotificationsChangedSource): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { source } }));
}

export function subscribeNotificationsChanged(
  handler: (source: NotificationsChangedSource) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<{ source?: NotificationsChangedSource }>).detail;
    handler(detail?.source === "bell" ? "bell" : "inbox");
  };
  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
}

export interface NotificationGroup {
  key: string;
  label: string;
  items: AppNotification[];
}

/** Groups newest-first notifications by workspace day: Today, Yesterday, then dates. */
export function groupNotificationsByDay(items: AppNotification[], today: string, timeZone: string): NotificationGroup[] {
  const yesterday = addDaysISO(today, -1);
  const groups: NotificationGroup[] = [];
  for (const item of items) {
    const day = dateInTimeZone(item.created_at, timeZone);
    let group = groups[groups.length - 1];
    if (!group || group.key !== day) {
      const label = day === today ? "Today" : day === yesterday ? "Yesterday" : formatDate(day, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
      });
      group = { key: day, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** Two buckets for the bell popover: Today and Earlier. */
export function groupTodayEarlier(items: AppNotification[], today: string, timeZone: string): NotificationGroup[] {
  const todayItems: AppNotification[] = [];
  const earlier: AppNotification[] = [];
  for (const item of items) {
    (dateInTimeZone(item.created_at, timeZone) === today ? todayItems : earlier).push(item);
  }
  return [
    { key: "today", label: "Today", items: todayItems },
    { key: "earlier", label: "Earlier", items: earlier },
  ].filter((group) => group.items.length > 0);
}

/** Icon bubble colours per notification tone (light + dark, like Badge). */
export const NOTIFICATION_TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-zinc-100 text-zinc-600 dark:bg-zinc-400/10 dark:text-zinc-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
  green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300",
  red: "bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300",
  orange: "bg-orange-50 text-orange-600 dark:bg-orange-400/10 dark:text-orange-300",
};
