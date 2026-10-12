import { THEME_STORAGE_KEY, applyTheme, readStoredTheme, resolveTheme } from "@/components/layout/theme-script";
import type { IconName } from "@/lib/constants";
import type { AppCommand } from "@/lib/types";

/**
 * Command palette action registry (SPEC.md section 20.2, W3 search).
 *
 * Later workflows append entries here, never in `command-palette.tsx`:
 *   W4 integration: Post update (`?tab=updates&compose=1`), Add risk
 *     (`?tab=risks&new=1`), Log eval run (`?tab=evals&new=1`), all `group: "project"`.
 *   W5 integration: Start/stop timer (id `toggle-timer`, command `{ type: "toggle-timer" }`)
 *     and Log time (command `{ type: "log-time" }`, or with `projectId` from the context).
 * `GlobalHotkeys` binds "t" only while an entry with id `toggle-timer` exists.
 *
 * Exactly one of `command`, `href` or `run` is set:
 * - `command` dispatches an AppCommand (a function receives the page context);
 * - `href` builds a link for the current project (project actions only);
 * - `run` runs client code directly.
 * Actions in `group: "project"` show only on `/projects/[id]`.
 */
export interface PaletteAction {
  id: string;
  label: string;
  icon: IconName;
  group: "actions" | "project";
  /** Shortcut hint in `<Kbd>` notation ("c", "shift+c", "?"). */
  keys?: string;
  /** Extra words the palette filter matches. */
  keywords?: string[];
  command?: AppCommand | ((ctx: { projectId?: string }) => AppCommand);
  href?: (ctx: { projectId: string }) => string;
  run?: () => void;
}

/** Light/dark switch usable outside React: persists, applies and notifies `useTheme` subscribers. */
function toggleTheme(): void {
  const next = resolveTheme(readStoredTheme()) === "dark" ? "light" : "dark";
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Private mode or blocked storage: the theme still applies for this page view.
  }
  applyTheme(next);
  // useTheme() listens for storage events; same-tab writes do not fire one, so send it.
  try {
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: next }));
  } catch {
    // Very old browsers without the StorageEvent constructor: the class is already applied.
  }
}

export const PALETTE_ACTIONS: readonly PaletteAction[] = [
  {
    id: "new-task",
    label: "New task",
    icon: "ListChecks",
    group: "actions",
    keys: "c",
    keywords: ["create", "add", "todo", "issue"],
    command: { type: "new-task" },
  },
  {
    id: "new-project",
    label: "New project",
    icon: "FolderKanban",
    group: "actions",
    keys: "shift+c",
    keywords: ["create", "add", "engagement"],
    command: { type: "new-project" },
  },
  {
    id: "new-client",
    label: "New client",
    icon: "Building2",
    group: "actions",
    keywords: ["create", "add", "company", "customer"],
    command: { type: "new-client" },
  },
  {
    id: "toggle-theme",
    label: "Toggle light or dark theme",
    icon: "Sparkles",
    group: "actions",
    keywords: ["theme", "dark", "light", "mode", "appearance"],
    run: toggleTheme,
  },
  {
    id: "keyboard-shortcuts",
    label: "Keyboard shortcuts",
    icon: "Keyboard",
    group: "actions",
    keys: "?",
    keywords: ["help", "keys", "hotkeys"],
    command: { type: "open-shortcuts" },
  },
  {
    id: "toggle-timer",
    label: "Start or stop timer",
    icon: "Timer",
    group: "actions",
    keys: "t",
    keywords: ["time", "track", "clock", "stopwatch"],
    command: { type: "toggle-timer" },
  },
  {
    id: "log-time",
    label: "Log time",
    icon: "Clock",
    group: "actions",
    keywords: ["time", "hours", "timesheet", "entry", "track"],
    command: (ctx) => ({ type: "log-time", projectId: ctx.projectId }),
  },
  {
    id: "project-new-task",
    label: "New task in this project",
    icon: "ListChecks",
    group: "project",
    keys: "c",
    keywords: ["create", "add", "todo"],
    command: (ctx) => ({ type: "new-task", projectId: ctx.projectId }),
  },
  {
    id: "project-new-subproject",
    label: "New sub-project here",
    icon: "FolderKanban",
    group: "project",
    keywords: ["create", "add", "child", "nested"],
    command: (ctx) => ({ type: "new-project", parentId: ctx.projectId }),
  },
  {
    id: "project-post-update",
    label: "Post update",
    icon: "Megaphone",
    group: "project",
    keywords: ["status", "rag", "weekly", "report", "health"],
    href: ({ projectId }) => `/projects/${projectId}?tab=updates&compose=1`,
  },
  {
    id: "project-add-risk",
    label: "Add risk",
    icon: "ShieldAlert",
    group: "project",
    keywords: ["raid", "issue", "assumption", "dependency", "create"],
    href: ({ projectId }) => `/projects/${projectId}?tab=risks&new=1`,
  },
  {
    id: "project-log-eval-run",
    label: "Log eval run",
    icon: "FlaskConical",
    group: "project",
    keywords: ["evaluation", "metrics", "benchmark", "model", "experiment"],
    href: ({ projectId }) => `/projects/${projectId}?tab=evals&new=1`,
  },
];

/** True while the registry has an action with this id (e.g. "toggle-timer"). */
export function hasPaletteAction(id: string): boolean {
  return PALETTE_ACTIONS.some((action) => action.id === id);
}
