import { AGREEMENT_METRIC_CONFIG, BATCH_UNIT_TYPE_CONFIG } from "@/lib/constants";
import type { AgreementMetric, BatchUnitType, DataBatch } from "@/lib/types";
import { addDaysISO, weekStartsBetween } from "@/lib/workspace-time";

/** Most weeks the per-week chart shows (the latest ones). */
export const MAX_CHART_WEEKS = 26;

const UNITS_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const PERCENT_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatUnits(value: number): string {
  return UNITS_FORMAT.format(value);
}

/** "2,000 audio hours" / "1 record". */
export function formatUnitCount(value: number, unitType: BatchUnitType): string {
  const config = BATCH_UNIT_TYPE_CONFIG[unitType];
  return `${formatUnits(value)} ${value === 1 ? config.singular : config.plural}`;
}

/** A fraction 0-1 as "95%" / "95.5%"; "—" for null. */
export function formatFraction(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${PERCENT_FORMAT.format(value * 100)}%`;
}

/** Agreement in its metric's scale: percent agreement as "92%", kappa/alpha as "0.82". */
export function formatAgreement(value: number | null | undefined, metric: AgreementMetric | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (metric === "percent") return formatFraction(value);
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
}

export function agreementLabel(metric: AgreementMetric | null): string {
  return metric ? AGREEMENT_METRIC_CONFIG[metric].label : "Agreement";
}

/** Input text for a stored fraction (0.95 -> "95"). */
export function fractionToInput(value: number | null): string {
  return value === null ? "" : String(Number((value * 100).toPrecision(12)));
}

/** Parses a percentage input back to a fraction ("95" -> 0.95); undefined when not a number, null when empty. */
export function inputToFraction(text: string): number | null | undefined {
  const cleaned = text.trim().replace(/%$/, "").trim();
  if (cleaned === "") return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return undefined;
  return Number((number / 100).toPrecision(12));
}

/** Agreement inputs: percent agreement is typed as a percentage, kappa/alpha as -1..1. */
export function agreementToInput(value: number | null, metric: AgreementMetric | null): string {
  if (value === null) return "";
  return metric === "percent" ? fractionToInput(value) : String(value);
}

export function inputToAgreement(text: string, metric: AgreementMetric | null): number | null | undefined {
  if (metric === "percent") return inputToFraction(text);
  const cleaned = text.trim();
  if (cleaned === "") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : undefined;
}

export type QualityResult = "pass" | "fail" | null;

/** Gold-set accuracy against the batch's threshold (else the project's). */
export function goldResult(batch: DataBatch, fallbackThreshold: number | null): QualityResult {
  const threshold = batch.quality_threshold ?? fallbackThreshold;
  if (batch.gold_accuracy === null || threshold === null) return null;
  return batch.gold_accuracy >= threshold ? "pass" : "fail";
}

export function agreementResult(batch: DataBatch): QualityResult {
  if (batch.agreement_score === null || batch.agreement_threshold === null) return null;
  return batch.agreement_score >= batch.agreement_threshold ? "pass" : "fail";
}

/** "Batch 3" / "Calibration · Batch 0", plus the name when set. */
export function batchTitle(batch: Pick<DataBatch, "number" | "name">): string {
  return batch.name ? `Batch ${batch.number} · ${batch.name}` : `Batch ${batch.number}`;
}

/**
 * Accepted units per week, with empty weeks filled in between the first and
 * the last accepted week (at most MAX_CHART_WEEKS, the latest ones).
 */
export function fillWeeks(points: readonly { week_start: string; units: number }[]): { week_start: string; units: number }[] {
  if (points.length === 0) return [];
  const byWeek = new Map(points.map((point) => [point.week_start, point.units]));
  const first = points[0].week_start;
  const last = points[points.length - 1].week_start;
  const weeks = weekStartsBetween(first, last).map((week) => ({ week_start: week, units: byWeek.get(week) ?? 0 }));
  return weeks.slice(-MAX_CHART_WEEKS);
}

/** Last day (Sunday) of a week that starts on `weekStart`. */
export function weekEnd(weekStart: string): string {
  return addDaysISO(weekStart, 6);
}
