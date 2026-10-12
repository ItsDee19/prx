import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachQuarterOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from "date-fns";
import type { TimelineRange, TimelineZoom } from "./types";

/*
 * Pure date math for the timeline engine (date-fns 4, no React, safe on the
 * server and the client). Date-only strings are parsed as local calendar
 * dates and only calendar-day differences are used, so the output is the
 * same in every timezone (no hydration drift). Weeks start on Monday.
 */

export const TIMELINE_ZOOMS: readonly TimelineZoom[] = ["week", "month", "quarter"];

export const ZOOM_LABELS: Record<TimelineZoom, string> = { week: "Week", month: "Month", quarter: "Quarter" };

/** Pixels per day at each zoom (SPEC section 20.2). */
export const ZOOM_DAY_PX: Record<TimelineZoom, number> = { week: 32, month: 10, quarter: 3 };

/** Smallest visible span per zoom, so short schedules still fill a useful width. */
const MIN_DAYS: Record<TimelineZoom, number> = { week: 35, month: 120, quarter: 365 };

/** Largest visible span per zoom (keeps the DOM bounded); longer schedules are clipped around today. */
const MAX_DAYS: Record<TimelineZoom, number> = { week: 371, month: 1100, quarter: 3660 };

const WEEK = { weekStartsOn: 1 } as const;

export function isTimelineZoom(value: unknown): value is TimelineZoom {
  return typeof value === "string" && (TIMELINE_ZOOMS as readonly string[]).includes(value);
}

/** The zoom named in a search param, else `fallback`. */
export function parseZoom(value: string | string[] | undefined, fallback: TimelineZoom): TimelineZoom {
  const raw = Array.isArray(value) ? value[0] : value;
  return isTimelineZoom(raw) ? raw : fallback;
}

/** A sensible zoom for a schedule: week up to ~6 weeks, month up to ~9 months, then quarter. */
export function autoZoom(range: TimelineRange | null): TimelineZoom {
  if (!range) return "month";
  const days = spanDays(range.start, range.end);
  if (days <= 45) return "week";
  if (days <= 270) return "month";
  return "quarter";
}

export function toDate(iso: string): Date {
  return parseISO(iso);
}

export function toISO(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));
}

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: string, to: string): number {
  return differenceInCalendarDays(toDate(to), toDate(from));
}

/** Inclusive day count of a span (1 for a single day). */
export function spanDays(start: string, end: string): number {
  return Math.abs(diffDays(start, end)) + 1;
}

export function addDaysTo(iso: string, days: number): string {
  return toISO(addDays(toDate(iso), days));
}

/** Earliest and latest of the given dates (invalid and empty values ignored). */
export function rangeOf(dates: readonly (string | null | undefined)[]): TimelineRange | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const date of dates) {
    if (!isIsoDate(date)) continue;
    if (start === null || date < start) start = date;
    if (end === null || date > end) end = date;
  }
  return start && end ? { start, end } : null;
}

/* ------------------------------- Formatting ------------------------------ */

/** "October 1, 2026" (screen-reader and tooltip text). */
export function formatFullDate(iso: string): string {
  return format(toDate(iso), "MMMM d, yyyy");
}

/** "Oct 1" or "Oct 1, 2026". */
export function formatShortDate(iso: string, withYear = false): string {
  return format(toDate(iso), withYear ? "MMM d, yyyy" : "MMM d");
}

/** "Oct 1 – Oct 28, 2026", "Oct 1, 2026" for a single day, years on both ends when they differ. */
export function formatDateRange(start: string, end: string): string {
  if (start === end) return formatShortDate(start, true);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatShortDate(start, !sameYear)} – ${formatShortDate(end, true)}`;
}

/** "October 1, 2026 to October 28, 2026" or a single full date. */
export function formatFullRange(start: string, end: string): string {
  return start === end ? formatFullDate(start) : `${formatFullDate(start)} to ${formatFullDate(end)}`;
}

/** "28 days" / "1 day". */
export function formatDayCount(start: string, end: string): string {
  const days = spanDays(start, end);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/* --------------------------------- Scale --------------------------------- */

export interface TimelineScale {
  zoom: TimelineZoom;
  /** First visible day (inclusive). */
  start: string;
  /** Last visible day (inclusive). */
  end: string;
  days: number;
  dayPx: number;
  /** Chart width in px (days × dayPx). */
  width: number;
}

function alignStart(date: Date, zoom: TimelineZoom): Date {
  if (zoom === "week") return startOfWeek(date, WEEK);
  if (zoom === "month") return startOfMonth(date);
  return startOfQuarter(date);
}

function alignEnd(date: Date, zoom: TimelineZoom): Date {
  if (zoom === "week") return endOfWeek(date, WEEK);
  if (zoom === "month") return endOfMonth(date);
  return endOfQuarter(date);
}

/**
 * The visible scale for a data range: always includes today, padded a little,
 * aligned to whole weeks / months / quarters, at least MIN_DAYS long and at
 * most MAX_DAYS (clipped around today when the schedule is longer).
 */
export function buildScale(range: TimelineRange | null, zoom: TimelineZoom, today: string): TimelineScale {
  const pad = zoom === "week" ? 3 : zoom === "month" ? 10 : 21;
  let first = range && range.start < today ? range.start : today;
  let last = range && range.end > today ? range.end : today;
  first = addDaysTo(first, -pad);
  last = addDaysTo(last, pad);

  if (spanDays(first, last) < MIN_DAYS[zoom]) last = addDaysTo(first, MIN_DAYS[zoom] - 1);
  if (spanDays(first, last) > MAX_DAYS[zoom]) {
    // Keep today a third of the way in, then clip to the data on either side.
    const before = Math.floor(MAX_DAYS[zoom] / 3);
    let clippedStart = addDaysTo(today, -before);
    if (clippedStart < first) clippedStart = first;
    let clippedEnd = addDaysTo(clippedStart, MAX_DAYS[zoom] - 1);
    if (clippedEnd > last) {
      clippedEnd = last;
      clippedStart = addDaysTo(last, -(MAX_DAYS[zoom] - 1));
    }
    first = clippedStart;
    last = clippedEnd;
  }

  const startDate = alignStart(toDate(first), zoom);
  const endDate = alignEnd(toDate(last), zoom);
  const start = toISO(startDate);
  const end = toISO(endDate);
  const days = spanDays(start, end);
  const dayPx = ZOOM_DAY_PX[zoom];
  return { zoom, start, end, days, dayPx, width: days * dayPx };
}

/** Day offset of a date from the scale start (may be outside 0..days-1). */
export function dayOffset(scale: TimelineScale, iso: string): number {
  return diffDays(scale.start, iso);
}

export interface PixelSpan {
  left: number;
  width: number;
  /** The item starts before / ends after the visible scale. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

/** Pixel box of an inclusive date span, clipped to the scale; null when entirely outside. */
export function spanToPixels(scale: TimelineScale, start: string, end: string): PixelSpan | null {
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const a = dayOffset(scale, from);
  const b = dayOffset(scale, to) + 1;
  if (b <= 0 || a >= scale.days) return null;
  const left = Math.max(0, a);
  const right = Math.min(scale.days, b);
  return {
    left: left * scale.dayPx,
    width: Math.max(1, right - left) * scale.dayPx,
    clippedStart: a < 0,
    clippedEnd: b > scale.days,
  };
}

/** Centre x of a day, or null when outside the scale. */
export function dayCenter(scale: TimelineScale, iso: string): number | null {
  const offset = dayOffset(scale, iso);
  if (offset < 0 || offset >= scale.days) return null;
  return (offset + 0.5) * scale.dayPx;
}

/** Percentage box of a span over the scale, for the phone layout's mini bars. */
export function spanToPercent(scale: TimelineScale, start: string, end: string): { left: number; width: number } | null {
  const box = spanToPixels(scale, start, end);
  if (!box) return null;
  return { left: (box.left / scale.width) * 100, width: (box.width / scale.width) * 100 };
}

/* --------------------------------- Header -------------------------------- */

export interface TimelineTick {
  key: string;
  label: string;
  /** Full text for screen readers and tooltips. */
  title: string;
  left: number;
  width: number;
  today?: boolean;
  weekend?: boolean;
}

function tick(scale: TimelineScale, key: string, from: Date, to: Date, label: string, title: string): TimelineTick | null {
  const box = spanToPixels(scale, toISO(from), toISO(to));
  if (!box) return null;
  return { key, label, title, left: box.left, width: box.width };
}

function compact<T>(items: (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null);
}

/**
 * Two header tiers per zoom: week = months over days, month = months over
 * weeks (Monday dates), quarter = quarters over months.
 */
export function headerTiers(scale: TimelineScale, today: string): { top: TimelineTick[]; bottom: TimelineTick[] } {
  const interval = { start: toDate(scale.start), end: toDate(scale.end) };

  const months = eachMonthOfInterval(interval).map((month) =>
    tick(scale, `m-${toISO(month)}`, month, endOfMonth(month), format(month, "MMMM yyyy"), format(month, "MMMM yyyy")),
  );

  if (scale.zoom === "week") {
    const days = eachDayOfInterval(interval).map((day) => {
      const iso = toISO(day);
      const item = tick(scale, `d-${iso}`, day, day, format(day, "d"), format(day, "EEEE, MMMM d, yyyy"));
      if (!item) return null;
      const weekday = day.getDay();
      return { ...item, label: `${format(day, "EEEEE")} ${format(day, "d")}`, today: iso === today, weekend: weekday === 0 || weekday === 6 };
    });
    return { top: compact(months), bottom: compact(days) };
  }

  if (scale.zoom === "month") {
    const weeks = eachWeekOfInterval(interval, WEEK).map((monday) => {
      const sunday = endOfWeek(monday, WEEK);
      const iso = toISO(monday);
      const item = tick(scale, `w-${iso}`, monday, sunday, format(monday, "MMM d"), `Week of ${format(monday, "MMMM d, yyyy")}`);
      return item ? { ...item, today: today >= iso && today <= toISO(sunday) } : null;
    });
    return { top: compact(months), bottom: compact(weeks) };
  }

  const quarters = eachQuarterOfInterval(interval).map((quarter) =>
    tick(
      scale,
      `q-${toISO(quarter)}`,
      quarter,
      endOfQuarter(quarter),
      `Q${Math.floor(quarter.getMonth() / 3) + 1} ${format(quarter, "yyyy")}`,
      `Quarter ${Math.floor(quarter.getMonth() / 3) + 1}, ${format(quarter, "yyyy")}`,
    ),
  );
  const monthTicks = eachMonthOfInterval(interval).map((month) => {
    const item = tick(scale, `qm-${toISO(month)}`, month, endOfMonth(month), format(month, "MMM"), format(month, "MMMM yyyy"));
    return item ? { ...item, today: today.slice(0, 7) === toISO(month).slice(0, 7) } : null;
  });
  return { top: compact(quarters), bottom: compact(monthTicks) };
}

/** x positions (px) of the vertical grid lines: bottom-tier boundaries, with top-tier ones marked strong. */
export function gridLines(scale: TimelineScale, today: string): { x: number; strong: boolean }[] {
  const { top, bottom } = headerTiers(scale, today);
  const strong = new Set(top.map((item) => item.left));
  const seen = new Set<number>();
  const lines: { x: number; strong: boolean }[] = [];
  for (const item of [...top, ...bottom]) {
    if (item.left === 0 || seen.has(item.left)) continue;
    seen.add(item.left);
    lines.push({ x: item.left, strong: strong.has(item.left) });
  }
  return lines;
}

/** The Saturday offset (px) of the first week, for weekend shading at week zoom (scale starts on Monday). */
export function weekendShading(scale: TimelineScale): { offset: number; period: number; width: number } {
  return { offset: 5 * scale.dayPx, period: 7 * scale.dayPx, width: 2 * scale.dayPx };
}

