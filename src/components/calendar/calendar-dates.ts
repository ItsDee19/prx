/**
 * Pure date helpers for the calendar (server and client). Every value is a
 * workspace-local "YYYY-MM-DD" string; date-fns works on local-midnight Dates
 * parsed from those strings and formatted straight back, so the machine's own
 * timezone never shifts a day. Weeks start on Monday (SPEC §23.4).
 */
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isSameYear,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type CalendarViewMode = "month" | "week";

const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

function toDate(iso: string): Date {
  return parseISO(iso);
}

function toISO(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Short weekday names, Monday first. */
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
/** Full weekday names, Monday first. */
export const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export interface CalendarRange {
  /** First visible day (a Monday). */
  start: string;
  /** Last visible day (a Sunday). */
  end: string;
  /** Visible days in rows of seven. */
  weeks: string[][];
  /** The month the grid is about ("YYYY-MM"); for week views, the anchor's month. */
  month: string;
}

/** The visible range for a view: a Monday-start month grid (4-6 rows) or one week. */
export function calendarRange(view: CalendarViewMode, anchor: string): CalendarRange {
  const date = toDate(anchor);
  const start = view === "month" ? startOfWeek(startOfMonth(date), WEEK_OPTIONS) : startOfWeek(date, WEEK_OPTIONS);
  const end = view === "month" ? endOfWeek(endOfMonth(date), WEEK_OPTIONS) : endOfWeek(date, WEEK_OPTIONS);
  const days = eachDayOfInterval({ start, end }).map(toISO);
  const weeks: string[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return { start: days[0], end: days[days.length - 1], weeks, month: anchor.slice(0, 7) };
}

/** The anchor one step back (-1) or forward (+1): the 1st of the month, or the Monday of the week. */
export function shiftAnchor(view: CalendarViewMode, anchor: string, step: -1 | 1): string {
  const date = toDate(anchor);
  return view === "month"
    ? toISO(addMonths(startOfMonth(date), step))
    : toISO(addWeeks(startOfWeek(date, WEEK_OPTIONS), step));
}

/** True when `date` is one of the days a view of `anchor` shows. */
export function rangeContains(view: CalendarViewMode, anchor: string, date: string): boolean {
  const range = calendarRange(view, anchor);
  return date >= range.start && date <= range.end;
}

/** "October 2026" for months; "5 – 11 Oct 2026", "28 Sep – 4 Oct 2026" or "29 Dec 2025 – 4 Jan 2026" for weeks. */
export function rangeTitle(view: CalendarViewMode, anchor: string): string {
  const date = toDate(anchor);
  if (view === "month") return format(date, "MMMM yyyy");
  const start = startOfWeek(date, WEEK_OPTIONS);
  const end = addDays(start, 6);
  if (isSameMonth(start, end)) return `${format(start, "d")} – ${format(end, "d MMM yyyy")}`;
  if (isSameYear(start, end)) return `${format(start, "d MMM")} – ${format(end, "d MMM yyyy")}`;
  return `${format(start, "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
}

/** "Monday 12 October 2026" (accessible names, popover titles). */
export function longDayLabel(date: string): string {
  return format(toDate(date), "EEEE d MMMM yyyy");
}

/** "Mon 12 Oct" (agenda headings, toasts). */
export function shortDayLabel(date: string): string {
  return format(toDate(date), "EEE d MMM");
}

/** Day of the month without padding ("1".."31"). */
export function dayOfMonth(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/** "Oct" (shown on the 1st of a month inside a grid). */
export function monthShort(date: string): string {
  return format(toDate(date), "MMM");
}
