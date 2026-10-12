"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronRight, LocateFixed } from "lucide-react";
import { useReducedMotionPreference } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { RagDot } from "@/components/ui/rag-dot";
import { cn } from "@/lib/utils";
import { TimelineLegend, legendKindsFor } from "./timeline-legend";
import { TimelineLane, rowExtent } from "./timeline-lane";
import { TimelineList } from "./timeline-list";
import { buildScale, dayCenter, gridLines, headerTiers, spanToPixels, weekendShading, type TimelineScale } from "./timeline-math";
import { rowAriaLabel } from "./timeline-text";
import type { TimelineGridGroup, TimelineGridProps, TimelineGridRow } from "./types";

/*
 * The shared timeline engine (SPEC.md section 20.2): CSS grid + date-fns,
 * no Gantt library, read-only. From `sm` a chart with a sticky label column
 * (140px, 240px from `md`), a sticky two-tier date header and horizontal
 * scroll inside its own container; below `sm` a stacked list with mini bars.
 * Bars are links whose aria-label spells out every date; they scale in from
 * the left once, staggered 35ms per row (static when motion is reduced).
 */

const GROUP_H = 36;
const ROW_H = 44;
const COMPACT_H = 36;
/** Long enough for the last staggered bar (7 × 35ms + 200ms) to finish. */
const SETTLE_MS = 7 * 35 + 200 + 150;

export type TimelineItem =
  | {
      type: "group";
      key: string;
      group: TimelineGridGroup;
      collapsed: boolean;
      count: number;
      top: number;
      height: number;
    }
  | {
      type: "row";
      key: string;
      row: TimelineGridRow;
      ariaLabel: string;
      hasChildren: boolean;
      collapsed: boolean;
      top: number;
      height: number;
      /** Index among visible rows (stagger order). */
      order: number;
    };

/** Visible header and bar rows, honouring collapsed groups and parent rows. */
function buildItems(
  rows: TimelineGridRow[],
  groups: TimelineGridGroup[],
  groupLabels: boolean,
  collapsed: ReadonlySet<string>,
): TimelineItem[] {
  const groupMap = new Map(groupLabels ? groups.map((group) => [group.id, group] as const) : []);
  const rowsById = new Map(rows.map((row) => [row.id, row] as const));
  const parents = new Set<string>();
  const groupCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.groupId) continue;
    if (groupMap.has(row.groupId)) groupCounts.set(row.groupId, (groupCounts.get(row.groupId) ?? 0) + 1);
    else if (rowsById.has(row.groupId)) parents.add(row.groupId);
  }

  const hiddenByParent = (row: TimelineGridRow): boolean => {
    let parentId = row.groupId;
    for (let depth = 0; parentId && depth < 8; depth += 1) {
      const parent = rowsById.get(parentId);
      if (!parent) return false;
      if (collapsed.has(parent.id)) return true;
      parentId = parent.groupId;
    }
    return false;
  };

  const items: TimelineItem[] = [];
  let top = 0;
  let order = 0;
  let currentGroup: string | null = null;
  for (const row of rows) {
    const groupId = row.groupId && groupMap.has(row.groupId) ? row.groupId : null;
    if (groupId && groupId !== currentGroup) {
      const group = groupMap.get(groupId);
      if (group) {
        items.push({
          type: "group",
          key: `group:${groupId}:${items.length}`,
          group,
          collapsed: collapsed.has(groupId),
          count: groupCounts.get(groupId) ?? 0,
          top,
          height: GROUP_H,
        });
        top += GROUP_H;
      }
    }
    currentGroup = groupId ?? (row.groupId && rowsById.has(row.groupId) ? currentGroup : null);
    if (groupId && collapsed.has(groupId)) continue;
    if (hiddenByParent(row)) continue;
    const height = row.compact ? COMPACT_H : ROW_H;
    items.push({
      type: "row",
      key: row.id,
      row,
      ariaLabel: rowAriaLabel(row),
      hasChildren: parents.has(row.id),
      collapsed: collapsed.has(row.id),
      top,
      height,
      order,
    });
    order += 1;
    top += height;
  }
  return items;
}

interface Connector {
  key: string;
  path: string;
  conflict: boolean;
}

/** Elbow connectors from the end of each blocker bar to the start of the blocked bar. */
function buildConnectors(
  items: TimelineItem[],
  dependencies: NonNullable<TimelineGridProps["dependencies"]>,
  scale: TimelineScale,
): Connector[] {
  const visible = new Map<string, { row: TimelineGridRow; y: number }>();
  for (const item of items) if (item.type === "row") visible.set(item.row.id, { row: item.row, y: item.top + item.height / 2 });
  const connectors: Connector[] = [];
  for (const dependency of dependencies) {
    const from = visible.get(dependency.from);
    const to = visible.get(dependency.to);
    if (!from || !to) continue;
    const fromExtent = rowExtent(from.row);
    const toExtent = rowExtent(to.row);
    if (!fromExtent || !toExtent) continue;
    const fromBox = spanToPixels(scale, fromExtent.start, fromExtent.end);
    const toBox = spanToPixels(scale, toExtent.start, toExtent.end);
    if (!fromBox || !toBox) continue;
    const x1 = fromBox.left + fromBox.width;
    const x2 = toBox.left;
    const { y: y1 } = from;
    const { y: y2 } = to;
    const conflict = toExtent.start <= fromExtent.end;
    let path: string;
    if (x2 - x1 >= 16) {
      const mid = x1 + 8;
      path = `M ${x1} ${y1} H ${mid} V ${y2} H ${x2 - 2}`;
    } else {
      // The blocked bar starts before the blocker ends: route around the bar start.
      const bend = y2 > y1 ? y2 - 14 : y2 + 14;
      path = `M ${x1} ${y1} H ${x1 + 8} V ${bend} H ${x2 - 10} V ${y2} H ${x2 - 2}`;
    }
    connectors.push({ key: `${dependency.from}->${dependency.to}`, path, conflict });
  }
  return connectors;
}

/** Scroll position that puts today about a third of the way into the visible chart. */
function scrollTargetForToday(scroller: HTMLElement, labelWidth: number, todayX: number): number {
  const visible = Math.max(0, scroller.clientWidth - labelWidth);
  return Math.max(0, todayX - visible / 3);
}

export function TimelineGrid({
  rows,
  range,
  zoom,
  today,
  groupLabels = false,
  groups = [],
  dependencies = [],
  labelHeading = "Name",
  "aria-label": ariaLabel,
  className,
}: TimelineGridProps) {
  const scale = useMemo(() => buildScale(range, zoom, today), [range, zoom, today]);
  const tiers = useMemo(() => headerTiers(scale, today), [scale, today]);
  const lines = useMemo(() => gridLines(scale, today), [scale, today]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [settled, setSettled] = useState(false);
  const reduced = useReducedMotionPreference();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLDivElement>(null);
  const markerId = useId();

  const items = useMemo(() => buildItems(rows, groups, groupLabels, collapsed), [rows, groups, groupLabels, collapsed]);
  const connectors = useMemo(() => buildConnectors(items, dependencies, scale), [items, dependencies, scale]);
  const legendKinds = useMemo(() => legendKindsFor(rows, dependencies.length > 0), [rows, dependencies]);
  const bodyHeight = items.reduce((sum, item) => sum + item.height, 0);
  const todayX = dayCenter(scale, today);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Start with today in view, and again whenever the zoom or the visible span changes.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || todayX === null) return;
    scroller.scrollLeft = scrollTargetForToday(scroller, cornerRef.current?.offsetWidth ?? 0, todayX);
  }, [todayX, scale.start, scale.zoom]);

  const scrollToToday = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || todayX === null) return;
    scroller.scrollTo({
      left: scrollTargetForToday(scroller, cornerRef.current?.offsetWidth ?? 0, todayX),
      behavior: reduced ? "auto" : "smooth",
    });
  }, [reduced, todayX]);

  const toggle = useCallback((id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const weekend = scale.zoom === "week" ? weekendShading(scale) : null;
  const contentStyle = {
    width: `calc(var(--tl-label) + ${scale.width}px)`,
    gridTemplateColumns: `var(--tl-label) ${scale.width}px`,
  } as CSSProperties;

  return (
    <section
      aria-label={ariaLabel}
      className={cn("min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-card", className)}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5">
        <TimelineLegend kinds={legendKinds} className="min-w-0 flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={scrollToToday}
          disabled={todayX === null}
          className="hidden sm:inline-flex"
        >
          <LocateFixed aria-hidden />
          Today
        </Button>
      </div>

      <TimelineList items={items} scale={scale} today={today} animate={!settled} onToggle={toggle} className="sm:hidden" />

      <div
        ref={scrollerRef}
        role="region"
        aria-label={`${ariaLabel}, chart`}
        tabIndex={0}
        className={cn(
          "relative hidden max-h-[min(72dvh,60rem)] overflow-auto overscroll-x-contain outline-none sm:block",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          "[--tl-label:140px] md:[--tl-label:240px]",
        )}
      >
        <div className="relative min-w-full" style={{ width: contentStyle.width }}>
          {/* Header: label heading + two date tiers, sticky to the top of the scroller. */}
          <div className="sticky top-0 z-20 grid border-b border-border bg-surface" style={contentStyle}>
            <div
              ref={cornerRef}
              className="sticky left-0 z-30 flex h-[52px] items-end border-r border-border bg-surface px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted"
            >
              {labelHeading}
            </div>
            <div className="relative h-[52px]" aria-hidden>
              {tiers.top.map((tick) => (
                <div
                  key={tick.key}
                  title={tick.title}
                  className="absolute top-0 flex h-6 items-center border-l border-border"
                  style={{ left: tick.left, width: tick.width }}
                >
                  <span className="sticky left-[calc(var(--tl-label)+0.5rem)] truncate px-2 text-xs font-semibold text-fg">
                    {tick.label}
                  </span>
                </div>
              ))}
              {tiers.bottom.map((tick) => (
                <div
                  key={tick.key}
                  title={tick.title}
                  className={cn(
                    "absolute bottom-0 flex h-7 items-center justify-center border-l border-t border-border/70 tabular-nums",
                    tick.weekend && "bg-fg/[0.035]",
                    tick.today && "bg-accent-soft/70 shadow-[inset_0_-2px_0_var(--accent)]",
                  )}
                  style={{ left: tick.left, width: tick.width }}
                >
                  <span
                    className={cn(
                      "truncate px-0.5 text-[11px] leading-none",
                      tick.today ? "font-semibold text-accent-soft-fg" : "text-fg-muted",
                    )}
                  >
                    {tick.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Body: back overlay (weekends, grid lines), rows, front overlay (today line, connectors). */}
          <div className="relative" style={{ height: bodyHeight }}>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-0"
              style={{
                left: "var(--tl-label)",
                width: scale.width,
                backgroundImage: weekend
                  ? `linear-gradient(to right, transparent ${weekend.offset}px, color-mix(in oklch, var(--fg) 3.5%, transparent) ${weekend.offset}px ${weekend.offset + weekend.width}px, transparent ${weekend.offset + weekend.width}px)`
                  : undefined,
                backgroundSize: weekend ? `${weekend.period}px 100%` : undefined,
              }}
            >
              {lines.map((line) => (
                <span
                  key={line.x}
                  className={cn("absolute inset-y-0 w-px", line.strong ? "bg-border" : "bg-grid-line")}
                  style={{ left: line.x }}
                />
              ))}
            </div>

            <ul role="list" className="relative">
              {items.map((item) =>
                item.type === "group" ? (
                  <li key={item.key} className="grid" style={{ gridTemplateColumns: contentStyle.gridTemplateColumns, height: item.height }}>
                    <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2 border-b border-r border-border bg-surface-2 px-2">
                      <button
                        type="button"
                        onClick={() => toggle(item.group.id)}
                        aria-expanded={!item.collapsed}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronRight
                          aria-hidden
                          className={cn(
                            "size-4 shrink-0 text-fg-muted transition-transform duration-150",
                            !item.collapsed && "rotate-90",
                          )}
                        />
                        {item.group.badge}
                        <span className="min-w-0 truncate text-sm font-semibold text-fg">{item.group.label}</span>
                        <span className="ml-auto shrink-0 rounded-full bg-fg/[0.06] px-1.5 text-[11px] font-medium tabular-nums text-fg-muted">
                          {item.count}
                          <span className="sr-only"> {item.count === 1 ? "row" : "rows"}</span>
                        </span>
                      </button>
                    </div>
                    <div className="border-b border-border bg-surface-2/50" />
                  </li>
                ) : (
                  <li
                    key={item.key}
                    className="group/row grid"
                    style={{ gridTemplateColumns: contentStyle.gridTemplateColumns, height: item.height }}
                  >
                    <RowLabel item={item} onToggle={toggle} />
                    <div className="relative border-b border-border/60 group-hover/row:bg-fg/[0.02]">
                      <TimelineLane
                        row={item.row}
                        scale={scale}
                        today={today}
                        animate={!settled}
                        order={item.order}
                        ariaLabel={item.ariaLabel}
                      />
                    </div>
                  </li>
                ),
              )}
            </ul>

            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-[5]"
              style={{ left: "var(--tl-label)", width: scale.width }}
            >
              {connectors.length > 0 ? (
                <svg width={scale.width} height={bodyHeight} className="absolute inset-0 overflow-visible">
                  <defs>
                    <marker id={`${markerId}-a`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0 0 L8 4 L0 8 z" fill="var(--fg-subtle)" />
                    </marker>
                    <marker id={`${markerId}-c`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0 0 L8 4 L0 8 z" fill="var(--warning)" />
                    </marker>
                  </defs>
                  {connectors.map((connector) => (
                    <path
                      key={connector.key}
                      d={connector.path}
                      fill="none"
                      stroke={connector.conflict ? "var(--warning)" : "var(--fg-subtle)"}
                      strokeWidth={1.25}
                      strokeDasharray={connector.conflict ? "3 3" : undefined}
                      strokeLinejoin="round"
                      markerEnd={`url(#${connector.conflict ? `${markerId}-c` : `${markerId}-a`})`}
                    />
                  ))}
                </svg>
              ) : null}
              {todayX !== null ? (
                <span
                  className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-accent-3"
                  style={{ left: todayX, boxShadow: "0 0 8px var(--accent-3)" }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RowLabel({
  item,
  onToggle,
}: {
  item: Extract<TimelineItem, { type: "row" }>;
  onToggle: (id: string) => void;
}) {
  const { row } = item;
  const indent = row.indent ?? 0;
  const focusable = !row.bar && !row.segments?.length;
  const label = (
    <span className={cn("block truncate text-fg", indent === 0 ? "text-sm font-medium" : "text-[13px]")}>{row.label}</span>
  );
  return (
    <div
      className="sticky left-0 z-10 flex min-w-0 items-center gap-1.5 border-b border-r border-border/60 bg-surface pr-2 group-hover/row:bg-surface-2"
      style={{ paddingLeft: 8 + indent * 14 }}
    >
      {item.hasChildren ? (
        <button
          type="button"
          onClick={() => onToggle(row.id)}
          aria-expanded={!item.collapsed}
          aria-label={`${item.collapsed ? "Expand" : "Collapse"} ${row.label}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-muted outline-none hover:bg-fg/[0.06] hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-8"
        >
          <ChevronRight
            aria-hidden
            className={cn("size-4 transition-transform duration-150", !item.collapsed && "rotate-90")}
          />
        </button>
      ) : (
        <span aria-hidden className="w-1 shrink-0" />
      )}
      {row.health !== undefined ? <RagDot health={row.health ?? null} /> : null}
      <div className="min-w-0 flex-1">
        {row.href ? (
          <Link
            href={row.href}
            scroll={false}
            tabIndex={focusable ? undefined : -1}
            aria-label={focusable ? item.ariaLabel : undefined}
            className="block rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </Link>
        ) : (
          label
        )}
        {row.sublabel ? <p className="truncate text-xs text-fg-muted">{row.sublabel}</p> : null}
      </div>
      {row.adornment ? <span className="flex shrink-0 items-center">{row.adornment}</span> : null}
    </div>
  );
}
