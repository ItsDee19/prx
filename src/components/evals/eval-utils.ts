import type { EvalMetrics, EvalRunWithMeta, MetricDirection } from "@/lib/types";
import { formatMetricValue } from "@/lib/utils";

/** A scorecard metric as the eval log uses it (serialisable; from listEvalMetricInfo). */
export interface ScorecardMetricRef {
  name: string;
  unit: string;
  direction: MetricDirection;
  baseline: number | null;
  target: number;
  current: number | null;
}

/** One metric column of the runs table (and one series of the trend chart). */
export interface MetricColumn {
  /** Lower-cased name: metric matching is case-insensitive everywhere. */
  key: string;
  /** Display name: the scorecard's spelling when there is one. */
  name: string;
  unit: string;
  direction: MetricDirection;
  target: number | null;
  baseline: number | null;
  /** true when the scorecard defines this metric. */
  onScorecard: boolean;
}

export function metricKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Case-insensitive lookup of a metric value in a run. */
export function metricValue(metrics: EvalMetrics, key: string): number | null {
  for (const [name, value] of Object.entries(metrics)) {
    if (metricKey(name) === key) return value;
  }
  return null;
}

/** The delta of a run for a column (deltas are keyed by the run's own spelling). */
export function metricDelta(run: EvalRunWithMeta, key: string): number | null {
  for (const [name, value] of Object.entries(run.deltas)) {
    if (metricKey(name) === key) return value;
  }
  return null;
}

/**
 * Columns: scorecard metrics first (by position), then any other metric a
 * run logged, alphabetically. Direction comes from the scorecard (default
 * higher is better), as the plan specifies.
 */
export function buildMetricColumns(runs: readonly EvalRunWithMeta[], scorecard: readonly ScorecardMetricRef[]): MetricColumn[] {
  const columns: MetricColumn[] = [];
  const seen = new Set<string>();
  for (const metric of scorecard) {
    const key = metricKey(metric.name);
    if (seen.has(key)) continue;
    seen.add(key);
    columns.push({
      key,
      name: metric.name,
      unit: metric.unit,
      direction: metric.direction,
      target: metric.target,
      baseline: metric.baseline,
      onScorecard: true,
    });
  }
  const extra = new Map<string, string>();
  for (const run of runs) {
    for (const name of Object.keys(run.metrics)) {
      const key = metricKey(name);
      if (!seen.has(key) && !extra.has(key)) extra.set(key, name.trim());
    }
  }
  for (const [key, name] of [...extra.entries()].sort((a, b) => a[1].localeCompare(b[1], "en", { sensitivity: "base" }))) {
    columns.push({ key, name, unit: "", direction: "higher", target: null, baseline: null, onScorecard: false });
  }
  return columns;
}

/** Only columns with at least one value (empty scorecard metrics stay out of the table). */
export function columnsWithValues(columns: readonly MetricColumn[], runs: readonly EvalRunWithMeta[]): MetricColumn[] {
  return columns.filter((column) => runs.some((run) => metricValue(run.metrics, column.key) !== null));
}

export function isPercentUnit(unit: string): boolean {
  return unit.trim() === "%";
}

/** Text for an input: "%" metrics are entered as percentages (0.61 -> "61"). */
export function toInputValue(value: number, unit: string): string {
  const shown = isPercentUnit(unit) ? value * 100 : value;
  return String(Number(shown.toPrecision(12)));
}

/** Parses an input back to the stored value ("%" metrics: "61" -> 0.61); null when not a number. */
export function fromInputValue(text: string, unit: string): number | null {
  const cleaned = text.trim().replace(/,/g, "").replace(/%$/, "").trim();
  if (cleaned === "") return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number)) return null;
  return isPercentUnit(unit) ? Number((number / 100).toPrecision(12)) : number;
}

export type DeltaTone = "better" | "worse" | "same";

export function deltaTone(delta: number, direction: MetricDirection): DeltaTone {
  if (Math.abs(delta) < 1e-12) return "same";
  const up = delta > 0;
  return (direction === "higher") === up ? "better" : "worse";
}

/** "+19 pts" for "%" metrics, "-200 ms" / "+0.04" otherwise. */
export function formatDelta(delta: number, unit: string): string {
  if (Math.abs(delta) < 1e-12) return "±0";
  const sign = delta > 0 ? "+" : "−";
  const abs = Math.abs(delta);
  if (isPercentUnit(unit)) {
    const points = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(abs * 100);
    return `${sign}${points} pts`;
  }
  return `${sign}${formatMetricValue(abs, unit)}`;
}

/** Id of the run with the best value for a column (ties: the newest), or null. */
export function bestRunId(runs: readonly EvalRunWithMeta[], column: MetricColumn): string | null {
  let best: { id: string; value: number } | null = null;
  for (const run of runs) {
    const value = metricValue(run.metrics, column.key);
    if (value === null) continue;
    if (
      best === null ||
      (column.direction === "higher" ? value > best.value : value < best.value)
    ) {
      best = { id: run.id, value };
    }
  }
  return best?.id ?? null;
}

/** Scorecard metrics a run would update when promoted with "Update scorecard". */
export function scorecardMatches(run: EvalRunWithMeta, scorecard: readonly ScorecardMetricRef[]): ScorecardMetricRef[] {
  return scorecard.filter((metric) => metricValue(run.metrics, metricKey(metric.name)) !== null);
}

export type EvalSortKey = "date" | "label" | `metric:${string}`;
export interface EvalSort {
  key: EvalSortKey;
  dir: "asc" | "desc";
}

export const DEFAULT_EVAL_SORT: EvalSort = { key: "date", dir: "desc" };

/** Runs sorted for the table; runs missing the sorted metric always go last. */
export function sortRuns(runs: readonly EvalRunWithMeta[], sort: EvalSort): EvalRunWithMeta[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  const sorted = [...runs];
  if (sort.key === "date") {
    sorted.sort((a, b) => factor * a.created_at.localeCompare(b.created_at) || a.label.localeCompare(b.label));
  } else if (sort.key === "label") {
    sorted.sort((a, b) => factor * a.label.localeCompare(b.label, "en", { sensitivity: "base", numeric: true }));
  } else {
    const key = sort.key.slice("metric:".length);
    sorted.sort((a, b) => {
      const va = metricValue(a.metrics, key);
      const vb = metricValue(b.metrics, key);
      if (va === null && vb === null) return b.created_at.localeCompare(a.created_at);
      if (va === null) return 1;
      if (vb === null) return -1;
      return factor * (va - vb) || b.created_at.localeCompare(a.created_at);
    });
  }
  return sorted;
}

/** Trend points for one metric: runs that logged it, oldest first. */
export interface TrendPoint {
  id: string;
  label: string;
  value: number;
  /** Workspace date "YYYY-MM-DD". */
  date: string;
  isChampion: boolean;
}
