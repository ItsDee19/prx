"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { TimeAgo } from "@/components/ui/time-ago";
import { NOTIFICATION_TYPE_CONFIG } from "@/lib/constants";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NOTIFICATION_TONE_CLASS } from "./notification-utils";

export interface NotificationItemProps {
  notification: AppNotification;
  /** Called when the link is followed (mark read, close the popover). */
  onOpen: (notification: AppNotification) => void;
  /** Shows a "Mark as read" button for unread rows (inbox). */
  onMarkRead?: (notification: AppNotification) => void;
  /** Denser layout for the bell popover. */
  compact?: boolean;
  className?: string;
}

/** Type icon, with the actor's avatar tucked into its corner when there is one. */
function NotificationGlyph({ notification }: { notification: AppNotification }) {
  const config = NOTIFICATION_TYPE_CONFIG[notification.type];
  return (
    <span className="relative mt-0.5 inline-flex shrink-0">
      <span
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-full ring-1 ring-inset ring-black/5 dark:ring-white/10",
          NOTIFICATION_TONE_CLASS[config.tone],
        )}
      >
        <Icon name={config.icon} label={config.label} className="size-4" />
      </span>
      {notification.actor ? (
        <UserAvatar
          user={notification.actor}
          size="xs"
          className="absolute -bottom-1 -right-1.5 size-4 text-[8px] ring-2 ring-surface"
        />
      ) : null}
    </span>
  );
}

/**
 * One notification: link to the task / project / comment anchor with the
 * title, a one-line body, the project or task key and the time. Unread rows
 * carry an accent dot (with an sr-only "Unread").
 */
export function NotificationItem({ notification, onOpen, onMarkRead, compact = false, className }: NotificationItemProps) {
  const unread = notification.read_at === null;
  const context = [notification.task_key, notification.project_name].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "group/notification relative flex items-start gap-3 rounded-[12px] transition-colors duration-(--dur-2)",
        compact ? "px-2.5 py-2" : "px-3 py-3 sm:px-4",
        unread ? "bg-accent-soft/40 hover:bg-accent-soft/70" : "hover:bg-surface-2",
        "focus-within:bg-surface-2",
        className,
      )}
    >
      <NotificationGlyph notification={notification} />
      <div className="min-w-0 flex-1">
        <Link
          href={notification.url}
          data-inbox-link=""
          onClick={() => onOpen(notification)}
          className={cn(
            "block rounded-sm text-sm leading-5 text-fg outline-none [overflow-wrap:anywhere]",
            "after:absolute after:inset-0 after:rounded-[12px] after:content-['']",
            "focus-visible:after:ring-2 focus-visible:after:ring-ring",
            unread ? "font-semibold" : "font-medium",
          )}
        >
          {unread ? <span className="sr-only">Unread: </span> : null}
          {notification.title}
        </Link>
        {notification.body ? (
          <p
            className={cn(
              "mt-0.5 text-sm leading-5 text-fg-muted [overflow-wrap:anywhere]",
              compact ? "line-clamp-1" : "line-clamp-2",
            )}
          >
            {notification.body}
          </p>
        ) : null}
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs leading-4 text-fg-subtle">
          {context ? <span className="min-w-0 truncate">{context}</span> : null}
          {context ? <span aria-hidden>·</span> : null}
          <TimeAgo date={notification.created_at} className="shrink-0" />
        </p>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1 self-center">
        {unread && onMarkRead ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Mark as read: ${notification.title}`}
            onClick={() => onMarkRead(notification)}
            className={cn(
              "size-8 text-fg-subtle hover:text-fg",
              "opacity-0 group-hover/notification:opacity-100 group-focus-within/notification:opacity-100 pointer-coarse:opacity-100",
            )}
          >
            <Check aria-hidden />
          </Button>
        ) : null}
        {unread ? <span aria-hidden className="size-2 rounded-full bg-accent shadow-[0_0_0_3px_var(--accent-soft)]" /> : null}
      </div>
    </div>
  );
}
