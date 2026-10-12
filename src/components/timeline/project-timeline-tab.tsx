import { ChartGantt } from "lucide-react";
import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { EmptyState } from "@/components/ui/empty-state";
import { getProjectTimeline } from "@/lib/data/timeline";
import { pluralize } from "@/lib/utils";
import { projectRows } from "./build-rows";
import { TimelineGrid } from "./timeline-grid";
import { autoZoom, isTimelineZoom, parseZoom } from "./timeline-math";
import { TimelineZoomControl } from "./timeline-zoom-control";

/**
 * The project page's Timeline tab (server, SPEC.md section 20.2): the
 * project bar with go-live and tuning window, then each phase or milestone
 * with its tasks indented and "blocked by" connectors. Read-only; zoom in
 * `?zoom=` (default picked from the schedule length). Task bars open the
 * task drawer (`?task=PRX-n`).
 */
export async function ProjectTimelineTab({ project, today, searchParams }: ProjectTabProps) {
  const data = await getProjectTimeline(project.id);
  const rawZoom = Array.isArray(searchParams.zoom) ? searchParams.zoom[0] : searchParams.zoom;

  if (!data || !data.range) {
    return (
      <section aria-label="Timeline" className="min-w-0">
        <EmptyState
          icon={ChartGantt}
          title="Nothing scheduled yet."
          description="Give the project, its phases or its tasks start and due dates to see them here."
        />
      </section>
    );
  }

  const defaultZoom = autoZoom(data.range);
  const zoom = parseZoom(searchParams.zoom, defaultZoom);
  const { rows, dependencies } = projectRows(data, today, { zoomParam: isTimelineZoom(rawZoom) ? rawZoom : null });

  const tasks = data.rows.flatMap((row) => row.tasks);
  const undated = tasks.filter((task) => !task.start_date && !task.due_date).length;
  const phases = data.rows.filter((row) => row.milestone?.kind === "phase").length;
  const points = data.rows.filter((row) => row.milestone?.kind === "milestone").length;
  const summary = [
    pluralize(phases, "phase"),
    points > 0 ? pluralize(points, "milestone") : null,
    pluralize(tasks.length, "task"),
    undated > 0 ? `${undated} without dates` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section aria-label="Timeline" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted tabular-nums">{summary}</p>
        <TimelineZoomControl zoom={zoom} defaultZoom={defaultZoom} />
      </div>
      <TimelineGrid
        rows={rows}
        range={data.range}
        zoom={zoom}
        today={today}
        dependencies={dependencies}
        labelHeading="Phase / task"
        aria-label={`Timeline of ${project.name}`}
      />
    </section>
  );
}
