import { FilesTab } from "@/components/attachments/files-tab";
import { BatchesTab } from "@/components/batches/batches-tab";
import { isBatchesTabVisible } from "@/components/batches/visibility";
import { EvalsTab } from "@/components/evals/evals-tab";
import { isEvalsTabVisible } from "@/components/evals/visibility";
import { RisksTab } from "@/components/risks/risks-tab";
import { ProjectTasksTab } from "@/components/tasks/project-tasks-tab";
import { ProjectTimeTab } from "@/components/time/project-time-tab";
import { ProjectTimelineTab } from "@/components/timeline/project-timeline-tab";
import { StatusUpdatesTab } from "@/components/updates/status-updates-tab";
import { PROJECT_TAB_CONFIG, type IconName } from "@/lib/constants";
import type { ProjectTabId } from "@/lib/types";
import { ActivityTab } from "../activity-tab";
import { OverviewTab } from "../overview/overview-tab";
import type { ProjectTabContext, ProjectTabEntry } from "./types";

/**
 * Project tab registry (SPEC.md section 21.1). Label, icon and order come from
 * PROJECT_TAB_CONFIG, so adding a tab is one entry `{ id, component, visible?,
 * badge? }`. A tab without an entry does not exist in the UI: unknown or
 * hidden `?tab=` values fall back to the overview.
 *
 * Integration entries: tasks (W2 integration, badge counts.tasks), timeline
 * and files (W3 integration, files badge counts.attachments), updates, risks
 * (badge counts.open_risks), evals and batches (W4 integration, with their
 * visibility rules), time (W5 integration).
 */
export const PROJECT_TABS: readonly ProjectTabEntry[] = [
  { id: "overview", component: OverviewTab },
  { id: "tasks", component: ProjectTasksTab, badge: (ctx) => ctx.counts.tasks },
  { id: "timeline", component: ProjectTimelineTab },
  { id: "files", component: FilesTab, badge: (ctx) => ctx.counts.attachments || null },
  { id: "updates", component: StatusUpdatesTab },
  { id: "risks", component: RisksTab, badge: (ctx) => ctx.counts.open_risks || null },
  { id: "evals", component: EvalsTab, visible: isEvalsTabVisible },
  { id: "batches", component: BatchesTab, visible: isBatchesTabVisible },
  { id: "time", component: ProjectTimeTab },
  { id: "activity", component: ActivityTab },
];

export const DEFAULT_PROJECT_TAB: ProjectTabId = "overview";

export type VisibleProjectTab = ProjectTabEntry & { label: string; icon: IconName; order: number };

/** Registered tabs visible in this context, with label/icon/order from PROJECT_TAB_CONFIG, by order. */
export function visibleProjectTabs(ctx: ProjectTabContext): VisibleProjectTab[] {
  const seen = new Set<ProjectTabId>();
  const tabs: VisibleProjectTab[] = [];
  for (const entry of PROJECT_TABS) {
    // The first entry wins if an id is ever registered twice.
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (entry.visible && !entry.visible(ctx)) continue;
    const config = PROJECT_TAB_CONFIG[entry.id];
    tabs.push({ ...entry, label: config.label, icon: config.icon, order: config.order });
  }
  return tabs.sort((a, b) => a.order - b.order);
}

/** The visible tab named by `?tab=` (first value), falling back to the overview. */
export function resolveProjectTab(
  requested: string | string[] | undefined,
  tabs: readonly VisibleProjectTab[],
): VisibleProjectTab {
  const id = Array.isArray(requested) ? requested[0] : requested;
  const match = id ? tabs.find((tab) => tab.id === id) : undefined;
  if (match) return match;
  const overview = tabs.find((tab) => tab.id === DEFAULT_PROJECT_TAB);
  if (overview) return overview;
  // The overview entry is always registered; this only guards a broken registry.
  const config = PROJECT_TAB_CONFIG[DEFAULT_PROJECT_TAB];
  return { id: DEFAULT_PROJECT_TAB, component: OverviewTab, label: config.label, icon: config.icon, order: config.order };
}

/** URL of a tab of a project (the overview has no `?tab=`). */
export function projectTabHref(projectId: string, tabId: ProjectTabId): string {
  return tabId === DEFAULT_PROJECT_TAB ? `/projects/${projectId}` : `/projects/${projectId}?tab=${tabId}`;
}
