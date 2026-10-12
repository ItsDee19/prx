import { Fragment, cache, type ReactNode } from "react";
import { NewClientDialogHost } from "@/components/clients/new-client-dialog-host";
import { CommandPalette } from "@/components/command/command-palette";
import { GlobalHotkeys } from "@/components/command/global-hotkeys";
import { ShortcutsHelp } from "@/components/command/shortcuts-help";
import { NewProjectDialogHost } from "@/components/projects/new-project-dialog-host";
import { NewTaskDialogHost } from "@/components/tasks/new-task-dialog-host";
import { TaskDrawerHost } from "@/components/tasks/task-drawer-host";
import { LogTimeDialogHost } from "@/components/time/log-time-dialog-host";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { isBlobEnabled } from "@/lib/data/attachments";
import { listProjectSummaries } from "@/lib/data/projects";
import { listUserSummaries } from "@/lib/data/users";
import { listSavedViews } from "@/lib/data/views";
import type { User } from "@/lib/types";

/**
 * One app-wide overlay host (drawer, dialog host, palette, hotkeys), rendered
 * once on the server for the signed-in user. Hosts are client components that
 * stay closed until opened by a URL param or an AppCommand.
 */
export type GlobalOverlayEntry = (user: User) => ReactNode | Promise<ReactNode>;

/*
 * Shared loaders, memoised per request with React `cache`, so several hosts
 * that need the same data (active users, project picker options, workspace
 * today) cost one query each. Only serialisable data reaches the client hosts.
 */
const loadUserSummaries = cache(() => listUserSummaries());
/** Every project, so a "New task" opened from any project page can prefill it. */
const loadProjectSummaries = cache(() => listProjectSummaries());
/** Open projects only: the time pickers never offer closed engagements. */
const loadOpenProjectSummaries = cache(() => listProjectSummaries({ openOnly: true }));
const loadWorkspaceToday = cache(() => getWorkspaceToday());

/*
 * Slot entries. Integration agents add entries here (SPEC.md section 20.3):
 *   W2: TaskDrawerHost (blobEnabled), NewTaskDialogHost, NewProjectDialogHost (users from
 *       listUserSummaries()), NewClientDialogHost.
 *   W3: CommandPalette, ShortcutsHelp, GlobalHotkeys; TaskDrawerHost switches to isBlobEnabled().
 *   W4: NewProjectDialogHost gets the workspace today (template-enabled new-project flow).
 *   W5: LogTimeDialogHost; CommandPalette gets savedViews={await listSavedViews(user.id)}.
 */
const GLOBAL_OVERLAYS: readonly GlobalOverlayEntry[] = [
  async (user) => {
    const [users, today] = await Promise.all([loadUserSummaries(), loadWorkspaceToday()]);
    return (
      <TaskDrawerHost
        users={users}
        viewerId={user.id}
        isAdmin={user.role === "admin"}
        today={today}
        blobEnabled={isBlobEnabled()}
      />
    );
  },
  async () => {
    const [users, projects] = await Promise.all([loadUserSummaries(), loadProjectSummaries()]);
    return <NewTaskDialogHost users={users} projects={projects} />;
  },
  async () => {
    const [users, today] = await Promise.all([loadUserSummaries(), loadWorkspaceToday()]);
    return <NewProjectDialogHost users={users} today={today} />;
  },
  () => <NewClientDialogHost />,
  async (user) => {
    const [users, savedViews] = await Promise.all([loadUserSummaries(), listSavedViews(user.id)]);
    return <CommandPalette users={users} savedViews={savedViews} isAdmin={user.role === "admin"} />;
  },
  (user) => <ShortcutsHelp isAdmin={user.role === "admin"} />,
  (user) => <GlobalHotkeys isAdmin={user.role === "admin"} />,
  async () => {
    const [projects, today] = await Promise.all([loadOpenProjectSummaries(), loadWorkspaceToday()]);
    return <LogTimeDialogHost projects={projects} today={today} />;
  },
];

export interface GlobalOverlaysProps {
  user: User;
}

/** App-wide overlay hosts (async server component), rendered once inside AppShell. */
export async function GlobalOverlays({ user }: GlobalOverlaysProps) {
  const nodes = await Promise.all(GLOBAL_OVERLAYS.map((entry) => entry(user)));
  return (
    <>
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </>
  );
}
