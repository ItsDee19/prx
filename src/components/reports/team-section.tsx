import { Activity, Gauge, TriangleAlert, Users } from "lucide-react";
import { Reveal } from "@/components/motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WORKLOAD_WEEKS } from "@/lib/constants";
import { hoursByPerson, workloadGrid } from "@/lib/data/reports";
import { pluralize } from "@/lib/utils";
import type { ChartSpec } from "./chart-types";
import { rangeLabel } from "./format";
import { KpiTile } from "./kpi-tile";
import { ReportChart } from "./report-chart";
import type { ReportSectionProps } from "./report-params";
import { WorkloadHeatmap } from "./workload-heatmap";

/** Team tab: workload heatmap (next WORKLOAD_WEEKS weeks) and hours and utilisation per person in the range. */
export async function TeamSection({ params, today }: ReportSectionProps) {
  const filters = { from: params.from, to: params.to, clientId: params.clientId ?? undefined };
  const [workload, people] = await Promise.all([workloadGrid(today, WORKLOAD_WEEKS), hoursByPerson(filters)]);

  const thisWeek = workload.map((row) => row.cells[0]).filter((cell) => cell && cell.capacity_minutes > 0);
  const overloaded = thisWeek.filter((cell) => cell.total_pct > 100).length;
  const avgLoad = thisWeek.length > 0 ? Math.round(thisWeek.reduce((sum, cell) => sum + cell.total_pct, 0) / thisWeek.length) : null;
  const logged = people.reduce((sum, row) => sum + row.minutes, 0);
  const capacity = people.reduce((sum, row) => sum + row.capacity_minutes, 0);
  const withTime = people.filter((row) => row.minutes > 0 || row.capacity_minutes > 0);

  const hoursSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    stacked: true,
    format: "hours",
    categoryLabel: "Person",
    series: [
      { key: "billable", label: "Billable", color: "series-1" },
      { key: "non_billable", label: "Non-billable", color: "series-3" },
    ],
    rows: withTime.map((row) => ({
      label: row.user.name,
      values: { billable: row.billable_minutes, non_billable: row.minutes - row.billable_minutes },
    })),
  };
  const utilisationSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    format: "percent",
    categoryLabel: "Person",
    series: [{ key: "utilisation", label: "Logged vs capacity", color: "series-1" }],
    rows: withTime
      .filter((row) => row.utilization_pct !== null)
      .map((row) => ({ label: row.user.name, values: { utilisation: row.utilization_pct ?? 0 } })),
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Reveal>
          <KpiTile label="People" icon={Users} value={{ kind: "count", value: workload.length }} hint="Active members" />
        </Reveal>
        <Reveal delay={0.035}>
          <KpiTile
            label="Over capacity"
            icon={TriangleAlert}
            tone={overloaded > 0 ? "warning" : "neutral"}
            value={{ kind: "count", value: overloaded }}
            hint="This week, planned plus logged"
          />
        </Reveal>
        <Reveal delay={0.07}>
          <KpiTile label="Average load" icon={Gauge} value={{ kind: "percent", value: avgLoad }} hint="This week, of capacity" />
        </Reveal>
        <Reveal delay={0.105}>
          <KpiTile
            label="Utilisation"
            icon={Activity}
            value={{ kind: "percent", value: capacity > 0 ? Math.round((100 * logged) / capacity) : null }}
            hint="Logged vs capacity in range"
          />
        </Reveal>
      </div>

      <Reveal delay={0.05}>
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>Workload</CardTitle>
              <CardDescription>
                Remaining task estimates spread over working days to each due date, plus hours already logged, against weekly
                capacity. Next {pluralize(WORKLOAD_WEEKS, "week")}; select a cell to open that person&rsquo;s tasks.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {workload.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">No active members.</p>
            ) : (
              <WorkloadHeatmap rows={workload} />
            )}
          </CardContent>
        </Card>
      </Reveal>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <ReportChart
          title="Hours by person"
          description={`Time logged per person (${rangeLabel(params.from, params.to)}).`}
          spec={hoursSpec}
          emptyText="No time logged in this range."
        />
        <ReportChart
          title="Utilisation"
          description="Hours logged as a share of each person's capacity over the working days in range."
          spec={utilisationSpec}
          emptyText="No time logged in this range."
        />
      </div>
    </div>
  );
}
