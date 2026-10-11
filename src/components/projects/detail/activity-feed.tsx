import { Activity as ActivityIcon, UserRound } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/ui/time-ago";
import type { Activity } from "@/lib/types";

export interface ActivityFeedProps {
  items: Activity[];
}

/** Vertical timeline of a project's own activity (newest first). */
export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
          <ActivityIcon className="size-5" aria-hidden />
        </div>
        <p className="text-sm font-medium text-fg">No activity yet</p>
        <p className="mt-1 text-sm text-fg-muted">Changes to this project will show up here.</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-border">
      {items.map((item) => (
        <li key={item.id} className="relative flex gap-3">
          <span className="relative z-10 shrink-0 rounded-full ring-4 ring-surface">
            {item.actor ? (
              <UserAvatar user={item.actor} size="sm" />
            ) : (
              <span
                role="img"
                aria-label="Unknown user"
                className="flex size-6 items-center justify-center rounded-full bg-surface-2 text-fg-subtle"
              >
                <UserRound className="size-3.5" aria-hidden />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="break-words text-sm leading-5 text-fg">
              <span className="font-medium">{item.actor?.name ?? "Someone"}</span>{" "}
              <span className="text-fg-muted">{item.message}</span>
            </p>
            <TimeAgo date={item.created_at} className="mt-0.5 block text-xs text-fg-subtle" />
          </div>
        </li>
      ))}
    </ol>
  );
}
