"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { MILESTONE_STATUS_CONFIG } from "@/lib/constants";
import type { MilestoneStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GateGlyph, GoLiveGlyph, MilestoneDiamond, TUNING_STYLE, rowColor, tint } from "./timeline-glyphs";
import { dayCenter, formatDateRange, formatShortDate, spanToPixels, type TimelineScale } from "./timeline-math";
import { MARKER_KIND_LABELS, rowTooltipLines } from "./timeline-text";
import type { TimelineGridMarker, TimelineGridRow } from "./types";

/** First-mount bar entry: scaleX from the left over 200ms, delayed per row (static when motion is reduced). */
export const BAR_ENTER_CLASS =
  "motion-safe:[animation:prx-grow-x_200ms_var(--ease-out-quart)_var(--bar-delay,0ms)_backwards]";

/** 35ms per row, capped at 8 steps (SPEC section 23.5). */
export function barDelay(order: number): CSSProperties {
  return { "--bar-delay": `${Math.min(order, 7) * 35}ms` } as CSSProperties;
}

/** Union of the row's bar and phase segments (the clickable box). */
export function rowExtent(row: TimelineGridRow): { start: string; end: string } | null {
  const dates: string[] = [];
  if (row.bar) dates.push(row.bar.start, row.bar.end);
  for (const segment of row.segments ?? []) dates.push(segment.start, segment.end);
  if (dates.length === 0) return null;
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

function segmentStyle(status: MilestoneStatus, color: string): CSSProperties {
  switch (status) {
    case "planned":
      return { backgroundColor: tint(color, 10), borderColor: tint(color, 55), borderStyle: "dashed" };
    case "active":
      return { backgroundColor: tint(color, 34), borderColor: tint(color, 80) };
    case "gate_review":
      return { backgroundColor: tint(color, 30), borderColor: "var(--warning)", boxShadow: `0 0 0 1px var(--warning)` };
    case "done":
      return { backgroundColor: tint(color, 50), borderColor: color };
    case "stopped":
      return { backgroundColor: tint("var(--danger)", 12), borderColor: tint("var(--danger)", 60), borderStyle: "dashed" };
  }
}

/** The tooltip body of a row: title, sublabel, dates, progress, phases, markers, details, warning. */
export function RowTooltip({ row }: { row: TimelineGridRow }) {
  const lines = rowTooltipLines(row);
  return (
    <div className="max-w-72 space-y-1.5 py-0.5">
      <div>
        <p className="font-semibold leading-snug">{row.label}</p>
        {row.sublabel ? <p className="font-normal opacity-75">{row.sublabel}</p> : null}
      </div>
      {lines.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-normal">
          {lines.map((line) => (
            <div key={line.key} className="contents">
              <dt className="max-w-32 truncate opacity-70">{line.label}</dt>
              <dd className="tabular-nums">{line.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {row.details?.length ? (
        <ul className="space-y-0.5 font-normal opacity-90">
          {row.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
      {row.warning ? <p className="font-medium text-warning">{row.warning}</p> : null}
    </div>
  );
}

function MarkerGlyph({ marker, color }: { marker: TimelineGridMarker; color: string }) {
  if (marker.kind === "go_live") return <GoLiveGlyph />;
  if (marker.kind === "gate") return <GateGlyph status={marker.status} />;
  return <MilestoneDiamond status={marker.status} color={color} />;
}

function markerTooltip(marker: TimelineGridMarker): string {
  const status = marker.status && marker.kind !== "go_live" ? ` · ${MILESTONE_STATUS_CONFIG[marker.status].label}` : "";
  const name = marker.kind === "go_live" ? MARKER_KIND_LABELS.go_live : `${MARKER_KIND_LABELS[marker.kind]}: ${marker.label}`;
  return `${name} · ${formatShortDate(marker.date, true)}${status}`;
}

export interface TimelineLaneProps {
  row: TimelineGridRow;
  scale: TimelineScale;
  today: string;
  /** Play the first-mount entry. */
  animate: boolean;
  /** Position among animated rows (stagger). */
  order: number;
  /** Full screen-reader label of the bar. */
  ariaLabel: string;
}

/** One row's chart lane: tuning band, bar with phase segments and progress, markers. */
export function TimelineLane({ row, scale, today, animate, order, ariaLabel }: TimelineLaneProps) {
  const color = rowColor(row.color);
  const extent = rowExtent(row);
  const box = extent ? spanToPixels(scale, extent.start, extent.end) : null;
  const hasSegments = (row.segments?.length ?? 0) > 0;
  const height = row.compact ? 14 : hasSegments ? 24 : 20;
  const tuningBox = row.tuning ? spanToPixels(scale, row.tuning.start, row.tuning.end) : null;
  const markers = (row.markers ?? [])
    .map((marker) => ({ marker, x: dayCenter(scale, marker.date) }))
    .filter((item): item is { marker: TimelineGridMarker; x: number } => item.x !== null);

  let barBody: ReactNode = null;
  if (box && extent) {
    const barBox = row.bar ? spanToPixels(scale, row.bar.start, row.bar.end) : null;
    const progress = row.bar?.progress;
    barBody = (
      <span
        className={cn("absolute inset-0 origin-left", animate && BAR_ENTER_CLASS)}
        style={animate ? barDelay(order) : undefined}
      >
        {barBox ? (
          <span
            className={cn(
              "absolute inset-y-0 overflow-hidden rounded-[7px] border",
              barBox.clippedStart && "rounded-l-none border-l-0",
              barBox.clippedEnd && "rounded-r-none border-r-0",
            )}
            style={{
              left: barBox.left - box.left,
              width: barBox.width,
              backgroundColor: tint(color, 18),
              borderColor: row.warning ? "var(--warning)" : tint(color, 45),
            }}
          >
            {progress !== undefined && progress > 0 ? (
              <span
                className="absolute inset-x-0 bottom-0 h-[3px] origin-left rounded-full"
                style={{ backgroundColor: color, transform: `scaleX(${Math.min(100, Math.max(0, progress)) / 100})` }}
              />
            ) : null}
          </span>
        ) : null}
        {row.segments?.map((segment) => {
          const segmentBox = spanToPixels(scale, segment.start, segment.end);
          if (!segmentBox) return null;
          const width = Math.max(2, segmentBox.width - 2);
          return (
            <span
              key={segment.id}
              className={cn(
                "absolute inset-y-[3px] flex items-center gap-1 overflow-hidden rounded-[5px] border px-1.5",
                segment.status === "stopped" && "line-through",
              )}
              style={{ left: segmentBox.left - box.left + 1, width, ...segmentStyle(segment.status, color) }}
            >
              {segment.status === "done" && width >= 28 ? (
                <Check aria-hidden className="size-3 shrink-0 text-fg" strokeWidth={3} />
              ) : null}
              {width >= 56 ? (
                <span className="truncate text-[11px] font-medium leading-none text-fg">{segment.label}</span>
              ) : null}
            </span>
          );
        })}
      </span>
    );
  }

  const barClass = cn(
    "absolute top-1/2 z-[1] -translate-y-1/2 rounded-[7px] outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    row.href && "cursor-pointer hover:ring-1 hover:ring-fg/25",
  );

  return (
    <>
      {tuningBox && row.tuning ? (
        <Tooltip content={`Tuning window · ${formatDateRange(row.tuning.start, row.tuning.end)}`}>
          <span
            aria-hidden
            className={cn(
              "absolute top-1/2 z-0 flex h-[30px] -translate-y-1/2 items-center justify-end overflow-hidden rounded-md border border-dashed pr-1.5",
              animate && BAR_ENTER_CLASS,
              "origin-left",
            )}
            style={{ left: tuningBox.left, width: tuningBox.width, ...TUNING_STYLE, ...(animate ? barDelay(order) : null) }}
          >
            {tuningBox.width >= 64 ? (
              <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-fg-muted">Tuning</span>
            ) : null}
          </span>
        </Tooltip>
      ) : null}

      {box ? (
        <Tooltip content={<RowTooltip row={row} />} side="top" align="start">
          {row.href ? (
            <Link
              href={row.href}
              scroll={false}
              aria-label={ariaLabel}
              className={barClass}
              style={{ left: box.left, width: box.width, height }}
            >
              {barBody}
            </Link>
          ) : (
            <span
              role="img"
              tabIndex={0}
              aria-label={ariaLabel}
              className={barClass}
              style={{ left: box.left, width: box.width, height }}
            >
              {barBody}
            </span>
          )}
        </Tooltip>
      ) : null}

      {markers.map(({ marker, x }) => (
        <Tooltip key={marker.id} content={markerTooltip(marker)}>
          <span
            aria-hidden
            className="absolute top-1/2 z-[2] flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: x }}
          >
            <MarkerGlyph marker={marker} color={color} />
          </span>
        </Tooltip>
      ))}

      {!box && markers.length === 0 && !tuningBox ? (
        <span
          className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs text-fg-subtle"
          style={{ left: Math.max(8, (dayCenter(scale, today) ?? 0) + 10) }}
        >
          {row.emptyText ?? "No dates"}
        </span>
      ) : null}
    </>
  );
}
