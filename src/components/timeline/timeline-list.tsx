"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { RagDot } from "@/components/ui/rag-dot";
import { cn } from "@/lib/utils";
import type { TimelineItem } from "./timeline-grid";
import { TUNING_STYLE, rowColor, tint } from "./timeline-glyphs";
import { BAR_ENTER_CLASS, barDelay } from "./timeline-lane";
import { formatDateRange, formatShortDate, spanToPercent, type TimelineScale } from "./timeline-math";
import type { TimelineGridRow } from "./types";

/*
 * Phone layout of the timeline (below `sm`): a stacked list of rows, each a
 * link with its dates and a mini bar over the whole visible range (phases,
 * markers, tuning window and today tick). Same rows, groups and collapse
 * state as the chart.
 */

function datesText(row: TimelineGridRow): string {
  if (row.bar) return formatDateRange(row.bar.start, row.bar.end);
  const first = row.segments?.[0];
  if (first) return formatDateRange(first.start, row.segments?.[row.segments.length - 1]?.end ?? first.end);
  const marker = row.markers?.[0];
  if (marker) return formatShortDate(marker.date, true);
  return row.emptyText ?? "No dates";
}

function MiniBar({
  row,
  scale,
  today,
  animate,
  order,
}: {
  row: TimelineGridRow;
  scale: TimelineScale;
  today: string;
  animate: boolean;
  order: number;
}) {
  const color = rowColor(row.color);
  const bar = row.bar ? spanToPercent(scale, row.bar.start, row.bar.end) : null;
  const tuning = row.tuning ? spanToPercent(scale, row.tuning.start, row.tuning.end) : null;
  const todayBox = spanToPercent(scale, today, today);
  const delay = animate ? barDelay(order) : undefined;
  return (
    <span aria-hidden className="relative mt-2 block h-2.5 rounded-full bg-fg/[0.06]">
      {tuning ? (
        <span
          className={cn("absolute inset-y-0 origin-left rounded-full border border-dashed", animate && BAR_ENTER_CLASS)}
          style={{ left: `${tuning.left}%`, width: `${tuning.width}%`, ...TUNING_STYLE, ...delay }}
        />
      ) : null}
      {bar ? (
        <span
          className={cn("absolute inset-y-0 origin-left overflow-hidden rounded-full", animate && BAR_ENTER_CLASS)}
          style={{ left: `${bar.left}%`, width: `max(${bar.width}%, 3px)`, backgroundColor: tint(color, 28), ...delay }}
        >
          {row.bar?.progress ? (
            <span
              className="absolute inset-0 origin-left"
              style={{ backgroundColor: color, transform: `scaleX(${Math.min(100, Math.max(0, row.bar.progress)) / 100})` }}
            />
          ) : null}
        </span>
      ) : null}
      {row.segments?.map((segment) => {
        const box = spanToPercent(scale, segment.start, segment.end);
        if (!box) return null;
        return (
          <span
            key={segment.id}
            className={cn("absolute inset-y-[2px] origin-left rounded-full", animate && BAR_ENTER_CLASS)}
            style={{
              left: `${box.left}%`,
              width: `max(calc(${box.width}% - 1px), 2px)`,
              backgroundColor: segment.status === "stopped" ? tint("var(--danger)", 45) : tint(color, segment.status === "planned" ? 35 : 75),
              ...delay,
            }}
          />
        );
      })}
      {row.markers?.map((marker) => {
        const box = spanToPercent(scale, marker.date, marker.date);
        if (!box) return null;
        return (
          <span
            key={marker.id}
            className={cn(
              "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border border-surface",
              marker.kind === "go_live" ? "bg-accent-2" : marker.status === "gate_review" ? "bg-warning" : marker.status === "done" ? "bg-success" : "bg-fg-muted",
            )}
            style={{ left: `${box.left + box.width / 2}%` }}
          />
        );
      })}
      {todayBox ? (
        <span
          className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-accent-3"
          style={{ left: `${todayBox.left + todayBox.width / 2}%`, boxShadow: "0 0 6px var(--accent-3)" }}
        />
      ) : null}
    </span>
  );
}

export interface TimelineListProps {
  items: TimelineItem[];
  scale: TimelineScale;
  today: string;
  animate: boolean;
  onToggle: (id: string) => void;
  className?: string;
}

export function TimelineList({ items, scale, today, animate, onToggle, className }: TimelineListProps) {
  return (
    <ul role="list" className={cn("divide-y divide-border", className)}>
      {items.map((item) => {
        if (item.type === "group") {
          return (
            <li key={item.key} className="bg-surface-2/70">
              <button
                type="button"
                onClick={() => onToggle(item.group.id)}
                aria-expanded={!item.collapsed}
                className="flex min-h-11 w-full min-w-0 items-center gap-2 px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ChevronRight
                  aria-hidden
                  className={cn("size-4 shrink-0 text-fg-muted transition-transform duration-150", !item.collapsed && "rotate-90")}
                />
                {item.group.badge}
                <span className="min-w-0 truncate text-sm font-semibold text-fg">{item.group.label}</span>
                <span className="ml-auto shrink-0 rounded-full bg-fg/[0.06] px-1.5 text-[11px] font-medium tabular-nums text-fg-muted">
                  {item.count}
                  <span className="sr-only"> {item.count === 1 ? "row" : "rows"}</span>
                </span>
              </button>
            </li>
          );
        }

        const { row } = item;
        const indent = row.indent ?? 0;
        const content = (
          <>
            <span className="flex min-w-0 items-center gap-1.5">
              {row.health !== undefined ? <RagDot health={row.health ?? null} /> : null}
              <span className={cn("min-w-0 truncate text-fg", indent === 0 ? "text-sm font-medium" : "text-[13px]")}>
                {row.label}
              </span>
              {row.adornment ? <span className="ml-auto flex shrink-0 items-center">{row.adornment}</span> : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-fg-muted tabular-nums">
              {row.sublabel ? `${row.sublabel} · ` : ""}
              {datesText(row)}
            </span>
            {row.warning ? <span className="mt-0.5 block text-xs font-medium text-warning">{row.warning}</span> : null}
            <MiniBar row={row} scale={scale} today={today} animate={animate} order={item.order} />
          </>
        );

        return (
          <li key={item.key} className="flex min-w-0 items-start gap-1" style={{ paddingLeft: 8 + indent * 14 }}>
            {item.hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(row.id)}
                aria-expanded={!item.collapsed}
                aria-label={`${item.collapsed ? "Expand" : "Collapse"} ${row.label}`}
                className="mt-2 flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight aria-hidden className={cn("size-4 transition-transform duration-150", !item.collapsed && "rotate-90")} />
              </button>
            ) : (
              <span aria-hidden className="w-2 shrink-0" />
            )}
            {row.href ? (
              <Link
                href={row.href}
                scroll={false}
                aria-label={item.ariaLabel}
                className="block min-w-0 flex-1 rounded-lg py-3 pr-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {content}
              </Link>
            ) : (
              <div className="min-w-0 flex-1 py-3 pr-4">
                <span className="sr-only">{item.ariaLabel}</span>
                <span aria-hidden>{content}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
