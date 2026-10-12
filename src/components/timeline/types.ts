import type { ReactNode } from "react";
import type { MilestoneStatus, RagHealth } from "@/lib/types";

/*
 * Contract of the shared timeline engine (SPEC.md section 20.2, W3
 * `timeline`). Everything here is serialisable (ReactNode values are
 * elements, never functions), so server components build the rows and hand
 * them to the client `TimelineGrid`.
 */

export type TimelineZoom = "week" | "month" | "quarter";

/** Inclusive "YYYY-MM-DD" span. */
export interface TimelineRange {
  start: string;
  end: string;
}

export interface TimelineGridSegment {
  id: string;
  label: string;
  start: string;
  end: string;
  status: MilestoneStatus;
}

export type TimelineMarkerKind = "milestone" | "gate" | "go_live";

export interface TimelineGridMarker {
  id: string;
  date: string;
  kind: TimelineMarkerKind;
  label: string;
  /** Milestone / gate status: gate-review markers pulse, done ones fill. */
  status?: MilestoneStatus;
}

export interface TimelineGridRow {
  id: string;
  label: string;
  sublabel?: string;
  /** Bars (and the label) link here. */
  href?: string;
  /** Bar colour (project colour); null = accent. */
  color: string | null;
  /** 0 = top level, 1 = nested (tasks under a phase), 2 = subtask. */
  indent?: number;
  bar: { start: string; end: string; progress?: number } | null;
  segments?: TimelineGridSegment[];
  markers?: TimelineGridMarker[];
  tuning?: { start: string; end: string } | null;
  health?: RagHealth | null;
  /**
   * Group this row belongs to: either a `TimelineGridGroup` id (a header row
   * the engine renders) or the id of another row, which then gets a
   * disclosure toggle that collapses its children.
   */
  groupId?: string;
  /* Engine extensions (optional). */
  /** Extra tooltip / screen-reader lines, e.g. "Status: In progress", "Blocked by PRX-4". */
  details?: string[];
  /** A scheduling problem (e.g. starts before its blocker ends): amber outline + text. */
  warning?: string | null;
  /** Small element after the label (service line icon, key). */
  adornment?: ReactNode;
  /** Shown in the lane when there is nothing to draw ("No dates"). */
  emptyText?: string;
  /** Renders the bar thinner (tasks). */
  compact?: boolean;
}

/** A header row (client group on the portfolio). */
export interface TimelineGridGroup {
  id: string;
  label: string;
  sublabel?: string;
  /** Element before the label (e.g. the client chip). */
  badge?: ReactNode;
}

/** "`to` is blocked by `from`": a connector from the end of `from` to the start of `to`. */
export interface TimelineGridDependency {
  from: string;
  to: string;
}

export interface TimelineGridProps {
  rows: TimelineGridRow[];
  range: TimelineRange;
  zoom: TimelineZoom;
  /** Workspace today ("YYYY-MM-DD"). */
  today: string;
  /** Render header rows for `groups` (collapsible). */
  groupLabels?: boolean;
  groups?: TimelineGridGroup[];
  dependencies?: TimelineGridDependency[];
  /** Heading of the label column, e.g. "Engagement". */
  labelHeading?: string;
  /** Accessible name of the chart region. */
  "aria-label": string;
  className?: string;
}
