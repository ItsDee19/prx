"use client";

import { UserRound } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { UserAvatar } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/ui/time-ago";
import type { TaskDrawerSectionProps } from "../drawer-sections";

/** Timeline of the task's latest activity, newest first. */
export function TaskActivitySection({ task }: TaskDrawerSectionProps) {
  if (task.activity.length === 0) {
    return <p className="text-sm text-fg-subtle">No activity yet.</p>;
  }

  return (
    <Stagger
      as="ol"
      className="relative space-y-3.5 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-border"
    >
      {task.activity.map((item) => (
        <StaggerItem key={item.id} as="li" className="relative flex gap-3">
          <span className="relative z-10 shrink-0 rounded-full ring-4 ring-surface">
            {item.actor ? (
              <UserAvatar user={item.actor} size="sm" />
            ) : (
              <span
                role="img"
                aria-label="Unknown user"
                className="flex size-6 items-center justify-center rounded-full bg-surface-2 text-fg-subtle"
              >
                <UserRound aria-hidden className="size-3.5" />
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm leading-5 text-fg [overflow-wrap:anywhere]">
              <span className="font-medium">{item.actor?.name ?? "Someone"}</span>{" "}
              <span className="text-fg-muted">{item.message}</span>
            </p>
            <TimeAgo date={item.created_at} className="mt-0.5 block text-xs text-fg-subtle" />
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
