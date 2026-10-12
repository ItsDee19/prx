/**
 * Pure helpers for entering and showing scorecard values (server and client).
 * Rates are stored as fractions 0-1; a "%" metric is typed and shown as a
 * percentage (65 means 0.65). Other units are typed as they are.
 */
import type { MetricDirection, SuccessMetric } from "@/lib/types";
import { formatMetricValue } from "@/lib/utils";

/** Units offered in the metric dialog (free text is allowed too). */
export const METRIC_UNIT_SUGGESTIONS = ["%", "ms", "s", "min", "h", "x"] as const;

/** Value as the user types it: "%" metrics ×100 (at most two decimals), others unchanged. */
export function toInputValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const display = unit === "%" ? Math.round(value * 100 * 100) / 100 : value;
  return String(display);
}

/**
 * Parses what the user typed. "" → null; "65", "65%", "1,400" are accepted.
 * Returns undefined when the text is not a number. "%" metrics are divided by 100.
 */
export function parseInputValue(text: string, unit: string): number | null | undefined {
  const cleaned = text.replace(/[,\s]/g, "").replace(/%$/, "");
  if (cleaned === "") return null;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  return unit === "%" ? Math.round((n / 100) * 1e9) / 1e9 : n;
}

/** "≥ 65%" / "≤ 1,500 ms": the target with the direction's comparison. */
export function targetLabel(metric: Pick<SuccessMetric, "direction" | "target" | "unit">): string {
  return `${metric.direction === "higher" ? "≥" : "≤"} ${formatMetricValue(metric.target, metric.unit)}`;
}

/** Short words for the direction ("Higher is better"). */
export function directionShort(direction: MetricDirection): string {
  return direction === "higher" ? "Higher is better" : "Lower is better";
}

/** The ring tone for a metric: met → success, measured but short → warning, unmeasured → accent. */
export function metricTone(isMet: boolean | null): "success" | "warning" | "accent" {
  if (isMet === true) return "success";
  if (isMet === false) return "warning";
  return "accent";
}
