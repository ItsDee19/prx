import { Clock, Flame, Gauge, Receipt } from "lucide-react";
import { Reveal } from "@/components/motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SERVICE_LINE_CONFIG } from "@/lib/constants";
import { burnByProject, hoursByClient, hoursByProject, hoursByServiceLine, hoursByWeek } from "@/lib/data/reports";
import { pluralize } from "@/lib/utils";
import { BurnList } from "./burn-list";
import type { ChartSeries, ChartSpec } from "./chart-types";
import { fullWeekLabel, rangeLabel, shortWeekLabel } from "./format";
import { KpiTile } from "./kpi-tile";
import { ReportChart } from "./report-chart";
import type { ReportSectionProps } from "./report-params";

/** Projects shown in "Hours by project". */
const TOP_PROJECTS = 12;

const BILLABLE_SERIES: ChartSeries[] = [
  { key: "billable", label: "Billable", color: "series-1" },
  { key: "non_billable", label: "Non-billable", color: "series-3" },
];

function splitRows<T>(rows: T[], label: (row: T) => string, minutes: (row: T) => number, billable: (row: T) => number) {
  return rows.map((row) => ({
    label: label(row),
    values: { billable: billable(row), non_billable: minutes(row) - billable(row) },
  }));
}

/** Time tab: hours per week, by client, project and service line, and budget burn. */
export async function TimeSection({ params, today }: ReportSectionProps) {
  const filters = { from: params.from, to: params.to, clientId: params.clientId ?? undefined };
  const [weeks, byClient, byProject, byLine, burn] = await Promise.all([
    hoursByWeek(filters),
    hoursByClient(filters),
    hoursByProject(filters, TOP_PROJECTS),
    hoursByServiceLine(filters),
    burnByProject(today, { clientId: params.clientId ?? undefined }),
  ]);

  const billable = weeks.reduce((sum, point) => sum + point.billable_minutes, 0);
  const total = weeks.reduce((sum, point) => sum + point.billable_minutes + point.non_billable_minutes, 0);
  const runningHot = burn.filter((row) => row.burn.running_hot).length;
  const overBudget = burn.filter((row) => row.burn.burn_pct >= 100).length;
  const range = rangeLabel(params.from, params.to);

  const weekSpec: ChartSpec = {
    kind: "bar",
    orientation: "columns",
    stacked: true,
    format: "hours",
    categoryLabel: "Week",
    series: BILLABLE_SERIES,
    rows: weeks.map((point) => ({
      label: shortWeekLabel(point.week_start),
      fullLabel: fullWeekLabel(point.week_start),
      values: { billable: point.billable_minutes, non_billable: point.non_billable_minutes },
    })),
  };
  const clientSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    stacked: true,
    format: "hours",
    categoryLabel: "Client",
    series: BILLABLE_SERIES,
    rows: splitRows(
      byClient,
      (row) => (row.client ? `${row.client.name} (${row.client.code})` : "No client"),
      (row) => row.minutes,
      (row) => row.billable_minutes,
    ),
  };
  const projectSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    stacked: true,
    format: "hours",
    categoryLabel: "Project",
    series: BILLABLE_SERIES,
    rows: splitRows(
      byProject,
      (row) => (row.project.client_code ? `${row.project.client_code} · ${row.project.name}` : row.project.name),
      (row) => row.minutes,
      (row) => row.billable_minutes,
    ),
  };
  const lineSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    stacked: true,
    format: "hours",
    categoryLabel: "Service line",
    series: BILLABLE_SERIES,
    rows: splitRows(
      byLine,
      (row) => (row.service_line ? SERVICE_LINE_CONFIG[row.service_line].label : "No service line"),
      (row) => row.minutes,
      (row) => row.billable_minutes,
    ),
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Reveal>
          <KpiTile label="Hours logged" icon={Clock} value={{ kind: "hours", minutes: total }} hint={range} />
        </Reveal>
        <Reveal delay={0.035}>
          <KpiTile
            label="Billable share"
            icon={Receipt}
            value={{ kind: "percent", value: total > 0 ? Math.round((100 * billable) / total) : null }}
            hint={total > 0 ? `${Math.round(billable / 60)}h billable` : "No time logged in range"}
          />
        </Reveal>
        <Reveal delay={0.07}>
          <KpiTile
            label="Running hot"
            icon={Flame}
            tone={runningHot > 0 ? "warning" : "neutral"}
            value={{ kind: "count", value: runningHot }}
            hint={`of ${pluralize(burn.length, "budgeted project")}`}
          />
        </Reveal>
        <Reveal delay={0.105}>
          <KpiTile
            label="Over budget"
            icon={Gauge}
            tone={overBudget > 0 ? "danger" : "neutral"}
            value={{ kind: "count", value: overBudget }}
            hint="At or above 100% of hours"
          />
        </Reveal>
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2 3xl:grid-cols-3">
        <Reveal delay={0.05} className="xl:col-span-2 3xl:col-span-2">
          <ReportChart
            title="Hours per week"
            description="Billable and non-billable time logged each week."
            spec={weekSpec}
            emptyText="No time logged in this range."
            className="h-full"
          />
        </Reveal>
        <Reveal delay={0.08}>
          <Card className="flex h-full flex-col">
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Budget burn</CardTitle>
                <CardDescription>
                  Open projects with an hours budget. The marker shows how much of the period has passed.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              {burn.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">
                  No open projects have an hours budget.
                </p>
              ) : (
                <BurnList rows={burn} className="max-h-[28rem] overflow-y-auto pr-1" />
              )}
            </CardContent>
          </Card>
        </Reveal>
        <ReportChart title="Hours by client" description={`Time logged per client (${range}).`} spec={clientSpec} emptyText="No time logged in this range." />
        <ReportChart
          title="Hours by project"
          description={`The ${TOP_PROJECTS} projects with the most time logged.`}
          spec={projectSpec}
          emptyText="No time logged in this range."
        />
        <ReportChart title="Hours by service line" description="Where the team's time goes." spec={lineSpec} emptyText="No time logged in this range." />
      </div>
    </div>
  );
}
