/**
 * Workspace-timezone date helpers. Pure: no `next/*`, no I/O, safe on the
 * server, the client and in scripts.
 *
 * PRX stores date-only fields as "YYYY-MM-DD" strings. "Today" must come from
 * the workspace timezone (app_settings.workspace_timezone, default
 * Asia/Kolkata), never from the server clock's local or UTC date: Vercel runs
 * in UTC, so an IST user would otherwise see off-by-one overdue states around
 * midnight. Callers load the timezone once (getAppSettings) and pass it in.
 *
 * All arithmetic on date-only strings is done in UTC on purpose, so it never
 * depends on the machine's timezone or DST.
 */
import { DEFAULT_WORKSPACE_TIMEZONE } from "./constants";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** true for a well-formed calendar date "YYYY-MM-DD". */
export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
}

/** true when Intl accepts the IANA zone name (e.g. "Asia/Kolkata"). */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** The zone itself when valid, otherwise DEFAULT_WORKSPACE_TIMEZONE. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_WORKSPACE_TIMEZONE;
}

function zonedParts(instant: Date, timeZone: string): Record<"year" | "month" | "day" | "hour", string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour") };
}

/** The calendar date ("YYYY-MM-DD") of an instant (Date or ISO timestamp) in a timezone. */
export function dateInTimeZone(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid instant: ${String(instant)}`);
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

/** Today's date in the workspace timezone. Use this for every "today" comparison. */
export function workspaceToday(timeZone: string, now: Date = new Date()): string {
  return dateInTimeZone(now, timeZone);
}

/** Current hour (0-23) in the workspace timezone, e.g. for the Home greeting. */
export function workspaceHour(timeZone: string, now: Date = new Date()): number {
  return Number(zonedParts(now, timeZone).hour) % 24;
}

function toUtcMs(date: string): number {
  const match = DATE_ONLY.exec(date);
  if (!match) throw new RangeError(`Expected "YYYY-MM-DD", got "${date}"`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Adds (or subtracts) whole days to a "YYYY-MM-DD" string. */
export function addDaysISO(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + Math.round(days) * DAY_MS);
}

/** Calendar days from `from` to `to` (positive when `to` is later). */
export function diffDaysISO(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** Days from `today` until `date` (negative when past); null without a date. */
export function daysUntilOn(date: string | null | undefined, today: string): number | null {
  return date ? diffDaysISO(today, date) : null;
}

/** Due before today and not closed. Works for tasks, projects, milestones and risks. */
export function isOverdueOn(dueDate: string | null | undefined, today: string, closed = false): boolean {
  return !closed && !!dueDate && dueDate < today;
}

/** today <= dueDate <= today + days. */
export function isDueWithin(dueDate: string | null | undefined, today: string, days: number): boolean {
  return !!dueDate && dueDate >= today && dueDate <= addDaysISO(today, days);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(date: string): number {
  return (new Date(toUtcMs(date)).getUTCDay() + 6) % 7;
}

export function isWeekendISO(date: string): boolean {
  return weekdayIndex(date) >= 5;
}

/** Monday of the ISO week containing `date`. */
export function startOfWeekISO(date: string): string {
  return addDaysISO(date, -weekdayIndex(date));
}

/** The seven dates Monday..Sunday starting at `weekStart`. */
export function weekDaysISO(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));
}

/** ISO week key, e.g. "2026-W41" (used in dedupe keys such as "stale:<projectId>:<key>"). */
export function isoWeekKey(date: string): string {
  // The ISO week-numbering year is the year of the week's Thursday.
  const thursday = addDaysISO(startOfWeekISO(date), 3);
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor(diffDaysISO(`${year}-01-01`, thursday) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function startOfMonthISO(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonthISO(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return fromUtcMs(Date.UTC(y, m, 0));
}

/** Every date from `from` to `to`, inclusive (empty when to < from). */
export function eachDayISO(from: string, to: string): string[] {
  const count = diffDaysISO(from, to);
  if (count < 0) return [];
  return Array.from({ length: count + 1 }, (_, i) => addDaysISO(from, i));
}

/** Mondays of every week that overlaps from..to. */
export function weekStartsBetween(from: string, to: string): string[] {
  const first = startOfWeekISO(from);
  const weeks: string[] = [];
  for (let monday = first; monday <= to; monday = addDaysISO(monday, 7)) weeks.push(monday);
  return weeks;
}

/** Monday-Friday dates from `from` to `to`, inclusive. */
export function workingDaysBetween(from: string, to: string): string[] {
  return eachDayISO(from, to).filter((date) => !isWeekendISO(date));
}

/**
 * The date the tuning window closes: go-live + tuning_days. The window covers
 * [go_live_date, end); days left = end - today (0 on the closing day).
 */
export function tuningEndDate(goLiveDate: string | null | undefined, tuningDays: number): string | null {
  return goLiveDate ? addDaysISO(goLiveDate, tuningDays) : null;
}
