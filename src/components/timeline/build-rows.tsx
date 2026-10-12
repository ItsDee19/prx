import { ClientChip } from "@/components/clients/client-chip";
import { ServiceLineBadge } from "@/components/clients/service-line-badge";
import { MILESTONE_KIND_CONFIG, MILESTONE_STATUS_CONFIG, STATUS_CONFIG, TASK_STATUS_CONFIG } from "@/lib/constants";
import type {
  ProjectTimelineDetail,
  TimelineBlocker,
  TimelinePortfolioData,
  TimelinePortfolioProject,
  TimelineTaskDetail,
} from "@/lib/data/timeline";
import type { TimelineMilestone } from "@/lib/types";
import { buildQueryString } from "@/lib/utils";
import { formatShortDate } from "./timeline-math";
import type { TimelineGridDependency, TimelineGridGroup, TimelineGridMarker, TimelineGridRow, TimelineGridSegment } from "./types";

/*
 * Server-side builders that turn timeline data into engine rows. Only
 * serialisable values (and elements) go into the rows, so the page and the
 * tab can hand them straight to the client `TimelineGrid`.
 */

const CLOSED_PROJECT = new Set(["completed", "cancelled"]);

function milestoneSpan(milestone: TimelineMilestone): { start: string; end: string } | null {
  const start = milestone.start_date ?? milestone.due_date;
  const end = milestone.due_date ?? milestone.start_date;
  if (!start || !end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

function phaseSegments(milestones: readonly TimelineMilestone[]): TimelineGridSegment[] {
  const segments: TimelineGridSegment[] = [];
  for (const milestone of milestones) {
    if (milestone.kind !== "phase") continue;
    const span = milestoneSpan(milestone);
    if (span) segments.push({ id: milestone.id, label: milestone.name, status: milestone.status, ...span });
  }
  return segments;
}

/** Point milestones (diamonds) and gate posts at the due date of gated phases. */
function milestoneMarkers(milestones: readonly TimelineMilestone[]): TimelineGridMarker[] {
  const markers: TimelineGridMarker[] = [];
  for (const milestone of milestones) {
    if (milestone.kind === "milestone") {
      const date = milestone.due_date ?? milestone.start_date;
      if (date) markers.push({ id: milestone.id, date, kind: "milestone", label: milestone.name, status: milestone.status });
    } else if (milestone.requires_gate && milestone.due_date) {
      markers.push({
        id: `${milestone.id}:gate`,
        date: milestone.due_date,
        kind: "gate",
        label: `${milestone.name} gate`,
        status: milestone.status,
      });
    }
  }
  return markers;
}

function goLiveMarker(project: TimelinePortfolioProject): TimelineGridMarker[] {
  return project.go_live_date
    ? [{ id: `${project.id}:go-live`, date: project.go_live_date, kind: "go_live", label: "Go-live" }]
    : [];
}

function tuningBand(project: TimelinePortfolioProject): { start: string; end: string } | null {
  return project.go_live_date && project.tuning_end_date
    ? { start: project.go_live_date, end: project.tuning_end_date }
    : null;
}

function phaseSublabel(project: TimelinePortfolioProject): string {
  const phase = project.current_phase;
  if (phase) return phase.status === "gate_review" ? `${phase.name} · Gate review` : phase.name;
  return STATUS_CONFIG[project.status].label;
}

function projectDetails(project: TimelinePortfolioProject): string[] {
  const details: string[] = [];
  if (project.current_phase) details.push(`Status: ${STATUS_CONFIG[project.status].label}`);
  details.push(`Owner: ${project.owner?.name ?? "Unassigned"}`);
  if (project.tuning_closed_at) details.push("Tuning closed");
  return details;
}

function overdueWarning(due: string | null, today: string, closed: boolean): string | null {
  return !closed && due && due < today ? `Past its due date (${formatShortDate(due, true)}).` : null;
}

/* -------------------------------- Portfolio ------------------------------ */

export const NO_CLIENT_GROUP = "client:none";

/** Rows and client header groups for /timeline. */
export function portfolioRows(
  data: TimelinePortfolioData,
  today: string,
): { rows: TimelineGridRow[]; groups: TimelineGridGroup[] } {
  const rows: TimelineGridRow[] = [];
  const groups: TimelineGridGroup[] = [];
  for (const group of data.groups) {
    const groupId = group.client ? `client:${group.client.id}` : NO_CLIENT_GROUP;
    groups.push({
      id: groupId,
      label: group.client ? group.client.name : "No client",
      badge: group.client ? <ClientChip client={group.client} /> : null,
    });
    for (const project of group.projects) {
      if (!project.span) continue;
      rows.push({
        id: project.id,
        label: project.name,
        sublabel: phaseSublabel(project),
        href: `/projects/${project.id}?tab=timeline`,
        color: project.color ?? project.client?.color ?? null,
        bar: { start: project.span.start, end: project.span.end, progress: project.progress },
        segments: phaseSegments(project.milestones),
        markers: [...milestoneMarkers(project.milestones), ...goLiveMarker(project)],
        tuning: tuningBand(project),
        health: project.health,
        groupId,
        details: projectDetails(project),
        warning: overdueWarning(project.due_date, today, CLOSED_PROJECT.has(project.status)),
        adornment: project.service_line ? <ServiceLineBadge value={project.service_line} iconOnly /> : undefined,
      });
    }
  }
  return { rows, groups };
}

/* ------------------------------- One project ----------------------------- */

const DONE_OR_CANCELLED = new Set(["done", "cancelled"]);

function taskBar(task: TimelineTaskDetail): TimelineGridRow["bar"] {
  const start = task.start_date ?? task.due_date;
  const end = task.due_date ?? task.start_date;
  if (!start || !end) return null;
  const progress = task.status === "done" ? 100 : undefined;
  return start <= end ? { start, end, progress } : { start: end, end: start, progress };
}

function blockerLine(blocker: TimelineBlocker): string {
  const due = blocker.due_date ? `, due ${formatShortDate(blocker.due_date, true)}` : "";
  const where = blocker.same_project ? "" : ", another project";
  return `Blocked by ${blocker.key} ${blocker.title} (${TASK_STATUS_CONFIG[blocker.status].label}${due}${where})`;
}

function taskWarning(task: TimelineTaskDetail, today: string): string | null {
  const closed = DONE_OR_CANCELLED.has(task.status);
  if (!closed) {
    const start = task.start_date ?? task.due_date;
    const late = task.blocked_by.find(
      (blocker) => !DONE_OR_CANCELLED.has(blocker.status) && blocker.due_date && start && blocker.due_date >= start,
    );
    if (late?.due_date) return `Starts before its blocker ${late.key} is due (${formatShortDate(late.due_date, true)}).`;
  }
  return overdueWarning(task.due_date, today, closed);
}

export interface ProjectRowsOptions {
  /** Current `?zoom=` value to keep in task links (null = default). */
  zoomParam: string | null;
}

/**
 * Rows for the project Timeline tab: the project itself (bar, go-live,
 * tuning window), then each milestone with its tasks indented (subtasks one
 * step further), then the "No phase" tasks. Phase rows link to the Tasks tab
 * filtered by that phase; task rows open the task drawer in place.
 */
export function projectRows(
  data: ProjectTimelineDetail,
  today: string,
  { zoomParam }: ProjectRowsOptions,
): { rows: TimelineGridRow[]; dependencies: TimelineGridDependency[] } {
  const { project } = data;
  const base = `/projects/${project.id}`;
  const color = project.color ?? project.client?.color ?? null;
  const rows: TimelineGridRow[] = [];
  const dependencies: TimelineGridDependency[] = [];
  const taskIds = new Set(data.rows.flatMap((row) => row.tasks.map((task) => task.id)));

  rows.push({
    id: `project:${project.id}`,
    label: project.name,
    sublabel: phaseSublabel(project),
    href: base,
    color,
    bar: project.span ? { start: project.span.start, end: project.span.end, progress: project.progress } : null,
    markers: goLiveMarker(project),
    tuning: tuningBand(project),
    health: project.health,
    details: projectDetails(project),
    warning: overdueWarning(project.due_date, today, CLOSED_PROJECT.has(project.status)),
    emptyText: "No project dates",
  });

  for (const row of data.rows) {
    const milestone = row.milestone;
    const groupId = milestone ? milestone.id : "milestone:none";
    const open = row.tasks.filter((task) => task.status !== "cancelled");
    const done = open.filter((task) => task.status === "done").length;

    if (milestone) {
      const span = milestone.kind === "phase" ? milestoneSpan(milestone) : null;
      const progress = milestone.status === "done" ? 100 : open.length > 0 ? Math.round((done / open.length) * 100) : 0;
      rows.push({
        id: milestone.id,
        label: milestone.name,
        sublabel: `${MILESTONE_KIND_CONFIG[milestone.kind].label} · ${MILESTONE_STATUS_CONFIG[milestone.status].label}`,
        href: `${base}${buildQueryString({ tab: "tasks", view: "list", milestone: milestone.id })}`,
        color,
        bar: span ? { ...span, progress } : null,
        markers: milestoneMarkers([milestone]),
        details: [
          `${done} of ${open.length} ${open.length === 1 ? "task" : "tasks"} done`,
          ...(milestone.requires_gate ? ["Go / no-go gate at the end"] : []),
        ],
        warning: overdueWarning(milestone.due_date, today, milestone.status === "done" || milestone.status === "stopped"),
        emptyText: "No phase dates",
      });
    } else {
      rows.push({
        id: groupId,
        label: "No phase",
        sublabel: `${open.length} ${open.length === 1 ? "task" : "tasks"}`,
        href: `${base}${buildQueryString({ tab: "tasks", view: "list", milestone: "none" })}`,
        color,
        bar: null,
        emptyText: "Tasks without a phase",
      });
    }

    const parents = new Set(row.tasks.map((task) => task.id));
    for (const task of row.tasks) {
      const isSubtask = task.parent_task_id !== null && parents.has(task.parent_task_id);
      const details = [`Status: ${TASK_STATUS_CONFIG[task.status].label}`];
      if (task.is_deliverable) details.push("Deliverable");
      for (const blocker of task.blocked_by) {
        details.push(blockerLine(blocker));
        if (blocker.same_project && taskIds.has(blocker.id)) dependencies.push({ from: blocker.id, to: task.id });
      }
      rows.push({
        id: task.id,
        label: task.title,
        sublabel: `${task.key} · ${task.assignee?.name ?? "Unassigned"}`,
        href: `${base}${buildQueryString({ tab: "timeline", zoom: zoomParam, task: task.key })}`,
        color,
        indent: isSubtask ? 2 : 1,
        bar: taskBar(task),
        groupId: isSubtask && task.parent_task_id ? task.parent_task_id : groupId,
        details,
        warning: taskWarning(task, today),
        emptyText: "No dates",
        compact: true,
      });
    }
  }

  return { rows, dependencies };
}
