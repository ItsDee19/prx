import { Fragment, type ReactNode } from "react";
import { CommandMenuTrigger } from "@/components/command/command-menu-trigger";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { TimerPill } from "@/components/time/timer-pill";
import { getWorkspaceTimezone } from "@/lib/data/app-settings";
import { countUnread } from "@/lib/data/notifications";
import { listProjectSummaries } from "@/lib/data/projects";
import { getRunningTimer } from "@/lib/data/time";
import type { User } from "@/lib/types";

/**
 * One control in the topbar's right-hand group, rendered on the server for
 * the signed-in user (it may load its own data, e.g. an unread count).
 */
export type TopbarActionEntry = (user: User) => ReactNode | Promise<ReactNode>;

/*
 * Slot entries, in display order (left to right, before the theme switch).
 * Integration agents add entries here (SPEC.md section 20.3):
 *   W3: CommandMenuTrigger, then NotificationBell (initial count from countUnread(user.id)).
 *   W5: TimerPill (initial timer + project summaries).
 */
const TOPBAR_ACTIONS: readonly TopbarActionEntry[] = [
  async (user) => {
    const [initialTimer, projects] = await Promise.all([
      getRunningTimer(user.id),
      listProjectSummaries({ openOnly: true }),
    ]);
    return <TimerPill initialTimer={initialTimer} projects={projects} />;
  },
  () => <CommandMenuTrigger />,
  async (user) => {
    const [initialUnread, timeZone] = await Promise.all([countUnread(user.id), getWorkspaceTimezone()]);
    return <NotificationBell initialUnread={initialUnread} timeZone={timeZone} />;
  },
];

export interface TopbarActionsProps {
  user: User;
}

/**
 * Right-hand topbar controls (async server component). AppShell renders it in
 * the glass topbar on every screen size; renders nothing while the slot is empty.
 */
export async function TopbarActions({ user }: TopbarActionsProps) {
  const nodes = await Promise.all(TOPBAR_ACTIONS.map((entry) => entry(user)));
  if (nodes.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-1 sm:gap-2">
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </div>
  );
}
