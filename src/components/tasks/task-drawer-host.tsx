"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePageReady } from "@/hooks/use-page-ready";
import type { UserSummary } from "@/lib/types";
import { TaskDrawer } from "./task-drawer";
import { hrefWithTask, TASK_PARAM } from "./task-helpers";

export interface TaskDrawerHostProps {
  users: UserSummary[];
  viewerId: string;
  isAdmin: boolean;
  /** Workspace today. */
  today: string;
  blobEnabled: boolean;
}

/**
 * Mounted once in GlobalOverlays: opens the TaskDrawer for `?task=PRX-n` on
 * any page and removes the param when the drawer closes, so any link can
 * open a task in place with `?task=<key>`.
 */
export function TaskDrawerHost(props: TaskDrawerHostProps) {
  // useSearchParams needs a Suspense boundary wherever a route could be prerendered.
  return (
    <Suspense fallback={null}>
      <TaskDrawerFromUrl {...props} />
    </Suspense>
  );
}

function TaskDrawerFromUrl({ users, viewerId, isAdmin, today, blobEnabled }: TaskDrawerHostProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Opens only once the first page load has hydrated: the modal Sheet marks the
  // rest of the page aria-hidden, which must not happen to boundaries still hydrating.
  const pageReady = usePageReady();
  const taskKey = pageReady ? searchParams.get(TASK_PARAM)?.trim() || null : null;

  function onOpenChange(open: boolean) {
    if (open) return;
    router.replace(hrefWithTask(pathname, searchParams.toString(), null), { scroll: false });
  }

  return (
    <TaskDrawer
      taskKey={taskKey}
      onOpenChange={onOpenChange}
      users={users}
      viewerId={viewerId}
      isAdmin={isAdmin}
      today={today}
      blobEnabled={blobEnabled}
    />
  );
}
