"use client";

import { useId, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ChartColumn, Table2 } from "lucide-react";
import { useReducedMotionPreference } from "@/components/motion/use-motion-preference";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChartTable } from "./chart-table";
import { isEmptyChart, type ChartSpec } from "./chart-types";

/** recharts only through next/dynamic with ssr: false (SPEC.md section 23.7). */
const RechartsChart = dynamic(() => import("./recharts-chart"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-xl" />,
});

type ChartView = "chart" | "table";

const VIEW_OPTIONS: { value: ChartView; label: string; icon: typeof ChartColumn }[] = [
  { value: "chart", label: "Chart", icon: ChartColumn },
  { value: "table", label: "Table", icon: Table2 },
];

export interface ReportChartProps {
  title: string;
  description?: string;
  spec: ChartSpec;
  /** Chart height in px; horizontal bar charts grow with their rows when omitted. */
  height?: number;
  /** Shown instead of the chart when every value is zero. */
  emptyText: string;
  /** Rendered under the chart in both views (server-rendered notes, links). */
  footer?: ReactNode;
  className?: string;
}

function chartHeight(spec: ChartSpec, height: number | undefined): number {
  if (height) return height;
  if (spec.kind === "bar" && spec.orientation === "rows") {
    return Math.max(160, spec.rows.length * 34 + (spec.series.length > 1 ? 64 : 36));
  }
  return 260;
}

/**
 * A report chart card with an accessible Chart / Table toggle. The chart
 * itself is decorative for assistive tech (`aria-hidden`); its data is always
 * available as a real table (the toggle, plus an sr-only copy while the
 * chart view is showing). Animations follow the app's motion setting.
 */
export function ReportChart({ title, description, spec, height, emptyText, footer, className }: ReportChartProps) {
  const [view, setView] = useState<ChartView>("chart");
  const reduced = useReducedMotionPreference();
  const titleId = useId();
  const empty = isEmptyChart(spec);
  const px = chartHeight(spec, height);

  return (
    <Card className={cn("flex flex-col", className)} aria-labelledby={titleId} role="region">
      <CardHeader className="flex-wrap">
        <div className="min-w-0 flex-1">
          <CardTitle id={titleId}>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {empty ? null : (
          <SegmentedControl
            value={view}
            onChange={setView}
            options={VIEW_OPTIONS}
            ariaLabel={`${title}: show as`}
            size="sm"
            iconOnly
          />
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {empty ? (
          <p className="flex min-h-32 flex-1 items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-sm text-fg-muted">
            {emptyText}
          </p>
        ) : view === "chart" ? (
          <>
            <div aria-hidden className="min-w-0" style={{ height: px }}>
              <RechartsChart spec={spec} height={px} reduced={reduced} />
            </div>
            <ChartTable spec={spec} caption={title} className="sr-only" />
          </>
        ) : (
          <ChartTable spec={spec} caption={title} />
        )}
        {footer ? <div className="mt-3">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
