import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AVATAR_COLORS } from "./constants";
import type { ProjectStatus } from "./types";

/** Merge Tailwind classes safely. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Parse either a date-only string ("YYYY-MM-DD", treated as local) or an ISO timestamp. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** "Oct 10, 2026" - deterministic (fixed en-US locale) so server and client agree. */
export function formatDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
): string {
  const d = parseDate(value);
  if (!d) return "\u2014";
  return new Intl.DateTimeFormat("en-US", options).format(d);
}

/** "Oct 10, 2026, 2:45 PM" */
export function formatDateTime(value: string | null | undefined): string {
  return formatDate(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Today's date as "YYYY-MM-DD" in local time. */
export function todayISODate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Add days to a "YYYY-MM-DD" string. */
export function addDays(dateOnly: string, days: number): string {
  const d = parseDate(dateOnly) ?? new Date();
  d.setDate(d.getDate() + days);
  return todayISODate(d);
}

/** Whole days from today until the given date-only string (negative if in the past). */
export function daysUntil(dateOnly: string | null | undefined, now: Date = new Date()): number | null {
  const d = parseDate(dateOnly);
  if (!d) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - start.getTime()) / 86_400_000);
}

/** A project is overdue when its due date is before today and it is still open. */
export function isOverdue(
  dueDate: string | null | undefined,
  status: ProjectStatus,
  now: Date = new Date(),
): boolean {
  if (status === "completed" || status === "cancelled") return false;
  const days = daysUntil(dueDate, now);
  return days !== null && days < 0;
}

/**
 * Short relative time such as "just now", "5m ago", "in 3d".
 * NOTE: because "now" differs between server and client, only render this
 * inside a client component after mount (see <TimeAgo>), or pass `now`.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const target = parseDate(iso);
  if (!target) return "";
  const diff = (target.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const fmt = (n: number, unit: string) => (diff < 0 ? `${n}${unit} ago` : `in ${n}${unit}`);
  if (abs < 45) return "just now";
  const m = Math.round(abs / 60);
  if (m < 60) return fmt(m, "m");
  const h = Math.round(m / 60);
  if (h < 24) return fmt(h, "h");
  const d = Math.round(h / 24);
  if (d < 30) return fmt(d, "d");
  const mo = Math.round(d / 30);
  if (mo < 12) return fmt(mo, "mo");
  return fmt(Math.round(d / 365), "y");
}

/** Up to two initials from a display name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministically pick a palette colour for a string (used for new users). */
export function colorFromString(seed: string, palette: readonly string[] = AVATAR_COLORS): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function truncate(text: string, max = 120): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "\u2026";
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Percentage of completed items, 0 when there are none. */
export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}
