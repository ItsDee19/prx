/**
 * Serialisable chart specs shared by the server report sections and the
 * client chart components (no functions cross the server/client boundary:
 * formats are tokens, colours are CSS-variable slots).
 */
import { formatHours } from "@/lib/duration";
import { formatMoney } from "@/lib/money";

/**
 * Colour slots. Categorical series take series-1..3 in fixed order; status
 * slots (good / warning / critical) are reserved for RAG-style meaning and
 * always ship with a text label. Values come from VIZ_THEME_CLASS.
 */
export type ChartColor = "series-1" | "series-2" | "series-3" | "good" | "warning" | "critical" | "muted";

export const CHART_COLOR_VAR: Record<ChartColor, string> = {
  "series-1": "var(--viz-1)",
  "series-2": "var(--viz-2)",
  "series-3": "var(--viz-3)",
  good: "var(--viz-good)",
  warning: "var(--viz-warning)",
  critical: "var(--viz-critical)",
  muted: "var(--viz-muted)",
};

/**
 * The chart palette as CSS variables, light and dark (validated reference
 * palette: categorical blue / orange / aqua plus fixed status steps). Put it
 * on the reports root so every chart and the heatmap read the same tokens.
 */
export const VIZ_THEME_CLASS = [
  "[--viz-1:#2a78d6] [--viz-2:#eb6834] [--viz-3:#1baf7a]",
  "[--viz-good:#0ca30c] [--viz-warning:#fab219] [--viz-critical:#d03b3b] [--viz-muted:#a3a3ad]",
  "dark:[--viz-1:#3987e5] dark:[--viz-2:#d95926] dark:[--viz-3:#199e70] dark:[--viz-muted:#5c5c66]",
].join(" ");

/** How values are printed on axes, tooltips and tables. Minutes are the stored unit for "hours". */
export type ValueFormat = "count" | "hours" | "percent" | "money-INR" | "money-USD";

export interface ChartSeries {
  key: string;
  label: string;
  color: ChartColor;
}

export interface ChartRow {
  /** Category label (x axis for columns and lines, y axis for horizontal bars). */
  label: string;
  /** Optional longer label for tooltips and the table (e.g. "Week of Oct 13, 2026"). */
  fullLabel?: string;
  /** Series key -> value (in the format's base unit: minutes for "hours"). */
  values: Record<string, number>;
}

export type ChartKind = "bar" | "line";

export interface ChartSpec {
  kind: ChartKind;
  /** Bars: "columns" (vertical bars over categories) or "rows" (horizontal bars). Lines ignore it. */
  orientation?: "columns" | "rows";
  stacked?: boolean;
  rows: ChartRow[];
  series: ChartSeries[];
  format: ValueFormat;
  /** Heading of the category column in the table view. */
  categoryLabel: string;
}

/** Full value for tooltips and tables. */
export function formatChartValue(value: number, format: ValueFormat): string {
  switch (format) {
    case "hours":
      return formatHours(value);
    case "percent":
      return `${Math.round(value)}%`;
    case "money-INR":
      return formatMoney(value, "INR");
    case "money-USD":
      return formatMoney(value, "USD");
    default:
      return new Intl.NumberFormat("en-US").format(value);
  }
}

/** Short value for axis ticks. */
export function formatAxisValue(value: number, format: ValueFormat): string {
  switch (format) {
    case "hours":
      return `${Math.round(value / 60)}h`;
    case "percent":
      return `${Math.round(value)}%`;
    case "money-INR":
      return formatMoney(value, "INR", { compact: true });
    case "money-USD":
      return formatMoney(value, "USD", { compact: true });
    default:
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
}

/** true when every value of every series is 0 (or there are no rows). */
export function isEmptyChart(spec: Pick<ChartSpec, "rows" | "series">): boolean {
  return spec.rows.every((row) => spec.series.every((series) => (row.values[series.key] ?? 0) === 0));
}
