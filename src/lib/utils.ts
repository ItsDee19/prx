import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  APP_COMMAND_EVENT,
  AVATAR_COLORS,
  BUDGET_THRESHOLDS,
  MENTION_PATTERN_SOURCE,
  RISK_SCORE_AMBER,
  RISK_SCORE_RED,
  RUNNING_HOT_MARGIN,
  TASK_KEY_PREFIX,
  TASK_POSITION_MIN_GAP,
  TASK_POSITION_STEP,
} from "./constants";
import type {
  AppCommand,
  BudgetBurn,
  BudgetPeriod,
  BudgetThreshold,
  LinkType,
  MetricDirection,
  ProjectStatus,
  RagHealth,
} from "./types";
import { addDaysISO, dateInTimeZone, diffDaysISO, endOfMonthISO, startOfMonthISO } from "./workspace-time";

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

/* ------------------------------------------------------------------ */
/* v2 helpers (pure; safe on server, client and in scripts)            */
/* ------------------------------------------------------------------ */

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** "PRX-142" for task number 142. */
export function taskKey(number: number): string {
  return `${TASK_KEY_PREFIX}-${number}`;
}

/** Parses "PRX-142", "prx 142" or "#142" into 142; null when it is not a task key. */
export function parseTaskKey(input: string): number | null {
  const match = new RegExp(`^\\s*(?:${TASK_KEY_PREFIX}[-\\s]?|#)(\\d{1,9})\\s*$`, "i").exec(input);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** likelihood x impact (1-25), or null when either is missing. */
export function riskScore(likelihood: number | null | undefined, impact: number | null | undefined): number | null {
  if (!likelihood || !impact) return null;
  return likelihood * impact;
}

/** >= RISK_SCORE_RED red, >= RISK_SCORE_AMBER amber, otherwise green; null without a score. */
export function riskSeverity(score: number | null | undefined): RagHealth | null {
  if (score === null || score === undefined) return null;
  if (score >= RISK_SCORE_RED) return "red";
  if (score >= RISK_SCORE_AMBER) return "amber";
  return "green";
}

/** Target met? null when there is no current value. */
export function metricIsMet(
  direction: MetricDirection,
  current: number | null | undefined,
  target: number,
): boolean | null {
  if (current === null || current === undefined || Number.isNaN(current)) return null;
  return direction === "higher" ? current >= target : current <= target;
}

/**
 * Progress from baseline toward target, 0-100 (clamped). Without a baseline the
 * bar runs from 0 for "higher" metrics; "lower" metrics need a baseline.
 */
export function metricProgress(
  direction: MetricDirection,
  baseline: number | null | undefined,
  current: number | null | undefined,
  target: number,
): number | null {
  if (current === null || current === undefined) return null;
  const start = baseline ?? (direction === "higher" ? 0 : null);
  if (start === null || start === target) {
    return metricIsMet(direction, current, target) ? 100 : null;
  }
  return Math.round(clamp(((current - start) / (target - start)) * 100, 0, 100));
}

/**
 * Display text for a scorecard / eval metric value. Rates are stored as
 * fractions 0-1 everywhere, so unit "%" shows value x 100 with at most one
 * decimal ("65%", "61.5%"); other units are appended ("1,400 ms", "20 h");
 * an empty unit shows the bare number ("0.85"). "—" for null.
 */
export function formatMetricValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const format = (n: number, maximumFractionDigits: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits, minimumFractionDigits: 0 }).format(n);
  if (unit === "%") return `${format(value * 100, 1)}%`;
  const abs = Math.abs(value);
  const text = format(value, abs >= 100 ? 0 : abs >= 1 ? 2 : 3);
  return unit ? `${text} ${unit}` : text;
}

/* ------------------------------ Mentions --------------------------- */

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; name: string; userId: string };

function mentionRegex(): RegExp {
  return new RegExp(MENTION_PATTERN_SOURCE, "g");
}

/** The inline token stored in comment bodies for a mention. */
export function mentionToken(user: { id: string; name: string }): string {
  const name = user.name.replace(/[\]\n\r]/g, " ").trim().slice(0, 80) || "user";
  return `@[${name}](user:${user.id})`;
}

/** Unique mentioned user ids in order of first appearance. */
export function parseMentions(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(mentionRegex())) {
    const id = match[2].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Splits a body into text and mention segments (for rendering chips). */
export function splitMentions(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(mentionRegex())) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ type: "text", text: body.slice(last, start) });
    segments.push({ type: "mention", name: match[1], userId: match[2].toLowerCase() });
    last = start + match[0].length;
  }
  if (last < body.length) segments.push({ type: "text", text: body.slice(last) });
  return segments;
}

/** Replaces mention tokens with "@Name" (notifications, snippets, copy for client). */
export function mentionsToPlainText(body: string): string {
  return body.replace(mentionRegex(), (_token, name: string) => `@${name}`);
}

/* ----------------------------- SQL helpers ------------------------- */

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** ILIKE pattern for a literal substring (use with `ESCAPE '\'`). */
export function likeContains(term: string): string {
  return `%${escapeLike(term)}%`;
}

/** LIKE pattern for a literal prefix, lower-cased (pairs with lower(col) text_pattern_ops indexes). */
export function likePrefix(term: string): string {
  return `${escapeLike(term.toLowerCase())}%`;
}

/* ------------------------------ URLs ------------------------------- */

type QueryValue = string | number | boolean | null | undefined;

function isValueList(value: QueryValue | readonly QueryValue[]): value is readonly QueryValue[] {
  return Array.isArray(value);
}

/** "?a=1&b=x&b=y" from a params object (empty values skipped); "" when nothing is set. */
export function buildQueryString(params: Record<string, QueryValue | readonly QueryValue[]>): string {
  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const values: readonly QueryValue[] = isValueList(raw) ? raw : [raw];
    for (const value of values) {
      if (value === null || value === undefined || value === "" || value === false) continue;
      search.append(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** true for absolute http(s) URLs only (rejects javascript:, data:, relative paths). */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Link type from the URL host (repo/staging/design/doc/drive), else "other". */
export function detectLinkType(value: string): LinkType {
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return "other";
  }
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is("github.com") || is("gitlab.com") || is("bitbucket.org")) return "repo";
  if (is("vercel.app") || is("netlify.app") || host.startsWith("staging.") || host.includes("-staging.")) {
    return "staging";
  }
  if (is("figma.com")) return "design";
  if (is("docs.google.com") || is("notion.so") || is("notion.site") || is("confluence.com")) return "doc";
  if (is("drive.google.com") || is("dropbox.com") || is("onedrive.live.com") || is("sharepoint.com")) {
    return "drive";
  }
  return "other";
}

/* ------------------------- Fractional ordering --------------------- */

/**
 * A position strictly between two neighbours (null = no neighbour on that
 * side). Appending after the last item adds TASK_POSITION_STEP.
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return TASK_POSITION_STEP;
  if (before === null) return (after as number) - TASK_POSITION_STEP;
  if (after === null) return before + TASK_POSITION_STEP;
  return (before + after) / 2;
}

/** true when the gap between neighbours is too small and the column should be rebalanced. */
export function needsRebalance(before: number | null, after: number | null): boolean {
  return before !== null && after !== null && Math.abs(after - before) < TASK_POSITION_MIN_GAP;
}

/* -------------------------------- CSV ------------------------------ */

type CsvCell = string | number | boolean | null | undefined;

function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Neutralise spreadsheet formula injection in text cells.
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV (CRLF line endings) with a header row. */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ---------------------------- Budget burn -------------------------- */

/**
 * The entry_date range whose minutes count toward the budget: the current
 * month (workspace today) for "monthly", every entry (both null) for "total".
 */
export function budgetPeriodRange(
  period: BudgetPeriod,
  today: string,
): { from: string | null; to: string | null } {
  return period === "monthly" ? { from: startOfMonthISO(today), to: endOfMonthISO(today) } : { from: null, to: null };
}

export interface BudgetBurnInput {
  budget_hours: number | null;
  budget_period: BudgetPeriod;
  start_date: string | null;
  due_date: string | null;
  /** Minutes logged inside budgetPeriodRange(period, today). */
  logged_minutes: number;
  /** Workspace today. */
  today: string;
}

/**
 * Burn against the hours budget (null without a budget). Elapsed % is the
 * share of the month (monthly) or of start..due (total) that has passed,
 * today inclusive. Running hot = burn exceeds elapsed by > RUNNING_HOT_MARGIN.
 */
export function computeBudgetBurn(input: BudgetBurnInput): BudgetBurn | null {
  if (input.budget_hours === null || input.budget_hours <= 0) return null;
  const burnPct = Math.round((input.logged_minutes / (input.budget_hours * 60)) * 100);

  let periodStart: string | null;
  let elapsedPct: number | null = null;
  if (input.budget_period === "monthly") {
    periodStart = startOfMonthISO(input.today);
    const days = diffDaysISO(periodStart, endOfMonthISO(input.today)) + 1;
    elapsedPct = Math.round(((diffDaysISO(periodStart, input.today) + 1) / days) * 100);
  } else {
    periodStart = input.start_date;
    if (input.start_date && input.due_date && input.due_date >= input.start_date) {
      const planned = diffDaysISO(input.start_date, input.due_date) + 1;
      const elapsed = diffDaysISO(input.start_date, input.today) + 1;
      elapsedPct = Math.round(clamp((elapsed / planned) * 100, 0, 100));
    }
  }

  let threshold: BudgetThreshold = 0;
  for (const value of BUDGET_THRESHOLDS) if (burnPct >= value) threshold = value;

  return {
    budget_hours: input.budget_hours,
    period: input.budget_period,
    period_start: periodStart,
    logged_minutes: input.logged_minutes,
    burn_pct: burnPct,
    elapsed_pct: elapsedPct,
    running_hot: elapsedPct !== null && burnPct - elapsedPct > RUNNING_HOT_MARGIN,
    threshold,
  };
}

/**
 * "Update due": an ongoing project whose latest status update (or, without
 * one, its creation) falls on a workspace date at least `cadenceDays` before
 * today. One definition for cards, Home, reports and update_due notifications.
 */
export function isUpdateDue(
  project: { status: ProjectStatus; health_updated_at: string | null; created_at: string },
  today: string,
  cadenceDays: number,
  timeZone: string,
): boolean {
  if (project.status !== "ongoing") return false;
  const last = dateInTimeZone(project.health_updated_at ?? project.created_at, timeZone);
  return last <= addDaysISO(today, -cadenceDays);
}

/** Budget RAG suggested in the status-update composer: >= 100% red, >= 90% or running hot amber. */
export function suggestBudgetRag(burn: BudgetBurn | null): RagHealth | null {
  if (!burn) return null;
  if (burn.burn_pct >= 100) return "red";
  if (burn.burn_pct >= 90 || burn.running_hot) return "amber";
  return "green";
}

/* --------------------------- App commands -------------------------- */

/** Fires an AppCommand for the feature hosts mounted in GlobalOverlays (client only). */
export function dispatchAppCommand(command: AppCommand): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AppCommand>(APP_COMMAND_EVENT, { detail: command }));
}

/** Listens for AppCommands; returns the unsubscribe function (use in an effect). */
export function subscribeAppCommands(handler: (command: AppCommand) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && event.detail && typeof event.detail === "object") {
      handler(event.detail as AppCommand);
    }
  };
  window.addEventListener(APP_COMMAND_EVENT, listener);
  return () => window.removeEventListener(APP_COMMAND_EVENT, listener);
}
