/**
 * Duration parsing and formatting for time tracking. Pure. All durations are
 * integer minutes.
 *
 * parseDuration accepts what people type in a timesheet cell or LogTimeDialog:
 *   "1h 30m", "1h30m", "1.5h", "2 hrs 15 mins", "90m", "90 min" -> unit tokens
 *   "1.5", "2", "0,5"                                           -> bare number = HOURS
 *   "1:30", "0:45"                                              -> h:mm
 * Returns null for anything else (including negative values). "0" returns 0
 * (a timesheet cell set to 0 clears it); callers enforce their own min/max.
 */

const UNIT_TOKEN = /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)(?![a-z])/g;
const UNIT_ONLY = /^(?:\s*\d+(?:[.,]\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)(?![a-z]))+\s*$/;

function toNumber(text: string): number {
  return Number(text.replace(",", "."));
}

export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  if (/^\d+(?:[.,]\d+)?$/.test(text)) {
    const hours = toNumber(text);
    return Number.isFinite(hours) ? Math.round(hours * 60) : null;
  }

  if (!UNIT_ONLY.test(text)) return null;
  let minutes = 0;
  for (const match of text.matchAll(UNIT_TOKEN)) {
    const value = toNumber(match[1]);
    if (!Number.isFinite(value)) return null;
    minutes += match[2].startsWith("h") ? value * 60 : value;
  }
  return Math.round(minutes);
}

/** 90 -> "1h 30m", 45 -> "45m", 120 -> "2h", 0 -> "0m". */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** 90 -> "1:30" (timesheet cells). */
export function formatMinutesClock(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 90 -> 1.5 (hours, rounded to `digits`). */
export function minutesToHours(minutes: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round((minutes / 60) * factor) / factor;
}

/** 90 -> "1.5h". */
export function formatHours(minutes: number, digits = 1): string {
  return `${minutesToHours(minutes, digits)}h`;
}

/** Running timer display: "04:05" under an hour, "1:04:05" after. */
export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Whole minutes between two ISO timestamps (at least 1, for a stopped timer). */
export function minutesBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(1, Math.round(ms / 60_000));
}
