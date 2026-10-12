import { cn } from "@/lib/utils";
import { CHART_COLOR_VAR, formatChartValue, type ChartSpec } from "./chart-types";

export interface ChartTableProps {
  spec: ChartSpec;
  caption: string;
  className?: string;
}

/** The data behind a chart as a real table (scrolls inside its own box on narrow screens). */
export function ChartTable({ spec, caption, className }: ChartTableProps) {
  const showTotal = spec.stacked === true && spec.series.length > 1;
  return (
    <div className={cn("max-h-96 overflow-auto rounded-xl border border-border", className)}>
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2 text-left text-xs text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              {spec.categoryLabel}
            </th>
            {spec.series.map((series) => (
              <th key={series.key} scope="col" className="px-3 py-2 text-right font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: CHART_COLOR_VAR[series.color] }} />
                  {series.label}
                </span>
              </th>
            ))}
            {showTotal ? (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Total
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {spec.rows.map((row, index) => (
            <tr key={`${row.label}-${index}`} className="border-t border-border">
              <th scope="row" className="max-w-64 truncate px-3 py-2 text-left font-medium text-fg">
                {row.fullLabel ?? row.label}
              </th>
              {spec.series.map((series) => (
                <td key={series.key} className="px-3 py-2 text-right tabular-nums text-fg">
                  {formatChartValue(row.values[series.key] ?? 0, spec.format)}
                </td>
              ))}
              {showTotal ? (
                <td className="px-3 py-2 text-right font-medium tabular-nums text-fg">
                  {formatChartValue(
                    spec.series.reduce((sum, series) => sum + (row.values[series.key] ?? 0), 0),
                    spec.format,
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
