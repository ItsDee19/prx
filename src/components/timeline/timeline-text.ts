import { MILESTONE_STATUS_CONFIG, RAG_CONFIG } from "@/lib/constants";
import { formatDateRange, formatDayCount, formatFullDate, formatFullRange, formatShortDate } from "./timeline-math";
import type { TimelineGridMarker, TimelineGridRow } from "./types";

/*
 * Text for timeline rows: the full screen-reader label of a bar (every date
 * spelled out) and the lines of its tooltip. Pure, shared by the grid and the
 * phone list.
 */

export const MARKER_KIND_LABELS: Record<TimelineGridMarker["kind"], string> = {
  milestone: "Milestone",
  gate: "Gate",
  go_live: "Go-live",
};

function markerSentence(marker: TimelineGridMarker): string {
  const status = marker.status ? `, ${MILESTONE_STATUS_CONFIG[marker.status].label}` : "";
  if (marker.kind === "go_live") return `Go-live ${formatFullDate(marker.date)}`;
  return `${MARKER_KIND_LABELS[marker.kind]}: ${marker.label}, ${formatFullDate(marker.date)}${status}`;
}

/** Everything a sighted user can read off the row, as one sentence list. */
export function rowAriaLabel(row: TimelineGridRow): string {
  const parts: string[] = [row.sublabel ? `${row.label}, ${row.sublabel}` : row.label];
  if (row.health !== undefined) {
    parts.push(`Health: ${row.health ? RAG_CONFIG[row.health].label : "No update"}`);
  }
  if (row.bar) {
    const progress = row.bar.progress !== undefined ? `, ${Math.round(row.bar.progress)}% complete` : "";
    parts.push(`${formatFullRange(row.bar.start, row.bar.end)}${progress}`);
  } else if (!row.markers?.length) {
    parts.push(row.emptyText ?? "No dates");
  }
  if (row.segments?.length) {
    parts.push(
      `Phases: ${row.segments
        .map((s) => `${s.label}, ${formatFullRange(s.start, s.end)}, ${MILESTONE_STATUS_CONFIG[s.status].label}`)
        .join("; ")}`,
    );
  }
  for (const marker of row.markers ?? []) parts.push(markerSentence(marker));
  if (row.tuning) parts.push(`Tuning window ${formatFullRange(row.tuning.start, row.tuning.end)}`);
  for (const detail of row.details ?? []) parts.push(detail);
  if (row.warning) parts.push(`Warning: ${row.warning}`);
  return parts.join(". ");
}

export interface TooltipLine {
  key: string;
  label: string;
  value: string;
}

/** Tooltip lines below the row title: dates, progress, phases, markers, tuning, details. */
export function rowTooltipLines(row: TimelineGridRow): TooltipLine[] {
  const lines: TooltipLine[] = [];
  if (row.bar) {
    lines.push({
      key: "dates",
      label: "Dates",
      value: `${formatDateRange(row.bar.start, row.bar.end)} · ${formatDayCount(row.bar.start, row.bar.end)}`,
    });
    if (row.bar.progress !== undefined) {
      lines.push({ key: "progress", label: "Progress", value: `${Math.round(row.bar.progress)}%` });
    }
  }
  for (const segment of row.segments?.slice(0, 6) ?? []) {
    lines.push({
      key: `s-${segment.id}`,
      label: segment.label,
      value: `${formatDateRange(segment.start, segment.end)} · ${MILESTONE_STATUS_CONFIG[segment.status].label}`,
    });
  }
  if ((row.segments?.length ?? 0) > 6) {
    lines.push({ key: "s-more", label: "More", value: `${(row.segments?.length ?? 0) - 6} more phases` });
  }
  for (const marker of row.markers ?? []) {
    const status = marker.status && marker.kind !== "go_live" ? ` · ${MILESTONE_STATUS_CONFIG[marker.status].label}` : "";
    lines.push({
      key: `m-${marker.id}`,
      label: marker.kind === "go_live" ? "Go-live" : marker.label,
      value: `${formatShortDate(marker.date, true)}${status}`,
    });
  }
  if (row.tuning) {
    lines.push({ key: "tuning", label: "Tuning", value: formatDateRange(row.tuning.start, row.tuning.end) });
  }
  return lines;
}
