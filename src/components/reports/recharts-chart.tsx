"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { CHART_COLOR_VAR, formatAxisValue, formatChartValue, type ChartSpec } from "./chart-types";

export interface RechartsChartProps {
  spec: ChartSpec;
  height: number;
  /** Skip the draw-in animation (reduced motion). */
  reduced: boolean;
}

type FlatRow = { label: string } & Record<string, number | string>;

const AXIS_TICK = { fill: "var(--fg-muted)", fontSize: 12 } as const;
const ANIMATION_MS = 600;
/** Category labels longer than this are shortened on the axis (the tooltip and table keep them whole). */
const MAX_TICK_CHARS = 18;

function shorten(text: string): string {
  return text.length > MAX_TICK_CHARS ? `${text.slice(0, MAX_TICK_CHARS - 1)}…` : text;
}

/** Tooltip in app tokens; looks the hovered category up in the spec (values never wear the series colour). */
function ChartTooltip({ active, label, spec }: Pick<TooltipContentProps<number, string>, "active" | "label"> & { spec: ChartSpec }) {
  if (!active || label === undefined) return null;
  const row = spec.rows.find((item) => item.label === String(label));
  if (!row) return null;
  const total = spec.series.reduce((sum, series) => sum + (row.values[series.key] ?? 0), 0);
  return (
    <div className="min-w-40 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1.5 font-semibold text-fg">{row.fullLabel ?? row.label}</p>
      <ul className="space-y-1">
        {spec.series.map((series) => (
          <li key={series.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-fg-muted">
              <span aria-hidden className="size-2 rounded-[2px]" style={{ backgroundColor: CHART_COLOR_VAR[series.color] }} />
              {series.label}
            </span>
            <span className="font-medium tabular-nums text-fg">{formatChartValue(row.values[series.key] ?? 0, spec.format)}</span>
          </li>
        ))}
      </ul>
      {spec.stacked && spec.series.length > 1 ? (
        <p className="mt-1.5 flex justify-between gap-4 border-t border-border pt-1.5 text-fg-muted">
          <span>Total</span>
          <span className="font-medium tabular-nums text-fg">{formatChartValue(total, spec.format)}</span>
        </p>
      ) : null}
    </div>
  );
}

function LegendLabel(value: string) {
  return <span className="text-xs text-fg-muted">{value}</span>;
}

/**
 * The recharts renderer behind ReportChart. Loaded only through
 * `next/dynamic` with `ssr: false` (SPEC.md section 23.7), so recharts never
 * ships in the server bundle or on pages other than /reports.
 */
export default function RechartsChart({ spec, height, reduced }: RechartsChartProps) {
  const data: FlatRow[] = spec.rows.map((row) => ({ label: row.label, ...row.values }));
  const showLegend = spec.series.length > 1;
  const tooltip = (
    <Tooltip
      cursor={spec.kind === "line" ? { stroke: "var(--border-strong)", strokeWidth: 1 } : { fill: "var(--surface-2)" }}
      content={(props) => <ChartTooltip active={props.active} label={props.label} spec={spec} />}
      isAnimationActive={false}
    />
  );
  const legend = showLegend ? <Legend verticalAlign="top" align="left" height={28} iconType="square" iconSize={10} formatter={LegendLabel} /> : null;

  if (spec.kind === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart accessibilityLayer={false} data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={16} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={48}
            allowDecimals={false}
            tickFormatter={(value: number) => formatAxisValue(value, spec.format)}
          />
          {tooltip}
          {legend}
          {spec.series.map((series) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={CHART_COLOR_VAR[series.color]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              isAnimationActive={!reduced}
              animationDuration={ANIMATION_MS}
              animationEasing="ease-out"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const rows = spec.orientation === "rows";
  const last = spec.series.length - 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        accessibilityLayer={false}
        data={data}
        layout={rows ? "vertical" : "horizontal"}
        margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
        barCategoryGap={rows ? 6 : "24%"}
      >
        <CartesianGrid horizontal={!rows} vertical={rows} stroke="var(--border)" />
        {rows ? (
          <>
            <XAxis
              type="number"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              tickFormatter={(value: number) => formatAxisValue(value, spec.format)}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              width={128}
              tickFormatter={shorten}
              interval={0}
            />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={shorten} minTickGap={8} />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={48}
              allowDecimals={false}
              tickFormatter={(value: number) => formatAxisValue(value, spec.format)}
            />
          </>
        )}
        {tooltip}
        {legend}
        {spec.series.map((series, index) => {
          // Rounded data end only on the outermost segment of a stack; 2px surface gap between fills.
          const roundEnd = !spec.stacked || index === last;
          const radius: [number, number, number, number] = roundEnd ? (rows ? [0, 4, 4, 0] : [4, 4, 0, 0]) : [0, 0, 0, 0];
          return (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label}
              stackId={spec.stacked ? "stack" : undefined}
              fill={CHART_COLOR_VAR[series.color]}
              stroke="var(--surface)"
              strokeWidth={spec.stacked ? 1 : 0}
              radius={radius}
              maxBarSize={rows ? 22 : 40}
              isAnimationActive={!reduced}
              animationDuration={ANIMATION_MS}
              animationEasing="ease-out"
            />
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}
