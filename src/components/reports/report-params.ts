/**
 * /reports URL state (SPEC.md section 19.1): `?tab=delivery|time|team|commercial&from&to&client`.
 * Pure helpers, safe on the server and the client.
 */
import { buildQueryString } from "@/lib/utils";
import { addDaysISO, diffDaysISO, isDateOnly, startOfWeekISO } from "@/lib/workspace-time";

export const REPORT_TABS = ["delivery", "time", "team", "commercial"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export const REPORT_TAB_CONFIG: Record<ReportTab, { label: string; description: string; adminOnly: boolean }> = {
  delivery: { label: "Delivery", description: "Portfolio health, throughput, on-time delivery, risk and evals.", adminOnly: false },
  time: { label: "Time", description: "Hours by week, client, project and service line, and budget burn.", adminOnly: false },
  team: { label: "Team", description: "Workload against capacity and hours per person.", adminOnly: false },
  commercial: { label: "Commercial", description: "Contract value per currency, invoicing and approximate margin.", adminOnly: true },
};

/** Weeks covered by the default range (this week and the 11 before it). */
export const DEFAULT_RANGE_WEEKS = 12;
/** Longest range accepted from the URL, in days (larger ranges are clipped at `to`). */
export const MAX_RANGE_DAYS = 731;

export interface RangePreset {
  id: string;
  label: string;
  weeks: number;
}

export const RANGE_PRESETS: readonly RangePreset[] = [
  { id: "4w", label: "Last 4 weeks", weeks: 4 },
  { id: "12w", label: "Last 12 weeks", weeks: 12 },
  { id: "26w", label: "Last 6 months", weeks: 26 },
  { id: "52w", label: "Last 12 months", weeks: 52 },
];

export interface ReportParams {
  tab: ReportTab;
  from: string;
  to: string;
  clientId: string | null;
  /** true when from/to differ from the default range. */
  customRange: boolean;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** The range of a preset ending today: Monday of (weeks - 1) weeks ago .. today. */
export function presetRange(today: string, weeks: number): { from: string; to: string } {
  return { from: addDaysISO(startOfWeekISO(today), -7 * (weeks - 1)), to: today };
}

export function defaultRange(today: string): { from: string; to: string } {
  return presetRange(today, DEFAULT_RANGE_WEEKS);
}

/** The preset id matching a range, or null for a custom range. */
export function matchingPreset(from: string, to: string, today: string): string | null {
  return RANGE_PRESETS.find((preset) => {
    const range = presetRange(today, preset.weeks);
    return range.from === from && range.to === to;
  })?.id ?? null;
}

/**
 * Validates the URL. Unknown tabs (and Commercial for members) fall back to
 * Delivery; bad dates fall back to the default range; a reversed range is
 * swapped; ranges longer than MAX_RANGE_DAYS keep `to` and clip `from`.
 */
export function parseReportParams(raw: RawSearchParams, today: string, isAdmin: boolean): ReportParams {
  const tabParam = first(raw.tab);
  const tab: ReportTab =
    (REPORT_TABS as readonly string[]).includes(tabParam) && (isAdmin || !REPORT_TAB_CONFIG[tabParam as ReportTab].adminOnly)
      ? (tabParam as ReportTab)
      : "delivery";

  const defaults = defaultRange(today);
  const fromParam = first(raw.from);
  const toParam = first(raw.to);
  let from = isDateOnly(fromParam) ? fromParam : defaults.from;
  let to = isDateOnly(toParam) ? toParam : isDateOnly(fromParam) && fromParam > today ? fromParam : defaults.to;
  if (to < from) [from, to] = [to, from];
  if (diffDaysISO(from, to) > MAX_RANGE_DAYS) from = addDaysISO(to, -MAX_RANGE_DAYS);

  const clientId = first(raw.client).slice(0, 64) || null;
  return { tab, from, to, clientId, customRange: from !== defaults.from || to !== defaults.to };
}

/** "/reports?tab=…&from=…" with the default range and Delivery tab left out of the URL. */
export function reportsHref(
  params: Pick<ReportParams, "tab" | "from" | "to" | "clientId">,
  today: string,
): string {
  const defaults = defaultRange(today);
  const custom = params.from !== defaults.from || params.to !== defaults.to;
  return `/reports${buildQueryString({
    tab: params.tab === "delivery" ? null : params.tab,
    from: custom ? params.from : null,
    to: custom ? params.to : null,
    client: params.clientId,
  })}`;
}

/** Props every report tab section receives from the page (serialisable, computed on the server). */
export interface ReportSectionProps {
  params: ReportParams;
  /** Workspace today. */
  today: string;
  timeZone: string;
  cadenceDays: number;
}
