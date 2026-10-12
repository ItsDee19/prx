import Link from "next/link";
import { AlarmClock, Briefcase, CircleCheck, OctagonAlert } from "lucide-react";
import { Reveal } from "@/components/motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DELIVERY_STATE_CONFIG, RISK_CATEGORY_CONFIG, SERVICE_LINE_CONFIG, STATUS_CONFIG, STATUS_ORDER } from "@/lib/constants";
import {
  evalImprovements,
  getPortfolioHealth,
  onTimeDeliveryRate,
  overdueByAssignee,
  overdueSummary,
  projectsByDeliveryState,
  projectsByPhase,
  projectsByServiceLine,
  riskExposureByCategory,
  throughputByWeek,
  type OnTimeStat,
} from "@/lib/data/reports";
import type { ProjectStatus } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import type { ChartColor, ChartSpec } from "./chart-types";
import { EvalImprovementsCard } from "./eval-improvements-card";
import { fullWeekLabel, rangeLabel, shortWeekLabel } from "./format";
import { KpiTile } from "./kpi-tile";
import { PortfolioHealthCard } from "./portfolio-health-card";
import { ReportChart } from "./report-chart";
import type { ReportSectionProps } from "./report-params";

const STATUS_COLOR: Record<ProjectStatus, ChartColor> = {
  to_start: "muted",
  ongoing: "series-1",
  on_hold: "warning",
  completed: "good",
  cancelled: "series-2",
};

function OnTimeRow({ label, stat }: { label: string; stat: OnTimeStat }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="tabular-nums text-fg-muted">
          {stat.total === 0 ? "None completed" : `${stat.on_time} of ${stat.total} on time`}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div
          role="meter"
          aria-label={`${label} delivered on time`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={stat.rate ?? 0}
          aria-valuetext={stat.rate === null ? "No completed items" : `${stat.rate}%`}
          className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-fg/[0.08]"
        >
          <div className="progress-fill absolute inset-0 rounded-full bg-(--viz-good)" style={{ transform: `scaleX(${(stat.rate ?? 0) / 100})` }} />
        </div>
        <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-fg">{stat.rate === null ? "—" : `${stat.rate}%`}</span>
      </div>
    </div>
  );
}

/** Delivery tab: portfolio health, mix, throughput, on-time delivery, overdue work, risk exposure and evals. */
export async function DeliverySection({ params, today, timeZone, cadenceDays }: ReportSectionProps) {
  const filters = { from: params.from, to: params.to, clientId: params.clientId ?? undefined };
  const scope = { clientId: params.clientId ?? undefined };
  const [health, byLine, byState, byPhase, throughput, onTime, overdueRows, overdue, risks, evals] = await Promise.all([
    getPortfolioHealth(today, cadenceDays, timeZone, scope),
    projectsByServiceLine(scope),
    projectsByDeliveryState(scope),
    projectsByPhase(scope),
    throughputByWeek(filters, timeZone),
    onTimeDeliveryRate(filters, timeZone),
    overdueByAssignee(today, scope),
    overdueSummary(today, scope),
    riskExposureByCategory(scope),
    evalImprovements(scope),
  ]);

  const openCount = health.counts.green + health.counts.amber + health.counts.red + health.counts.none;
  const created = throughput.reduce((sum, point) => sum + point.created, 0);
  const completed = throughput.reduce((sum, point) => sum + point.completed, 0);
  const presentStatuses = STATUS_ORDER.filter((status) => byLine.some((row) => row.counts[status] > 0));

  const lineSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    stacked: true,
    format: "count",
    categoryLabel: "Service line",
    series: presentStatuses.map((status) => ({ key: status, label: STATUS_CONFIG[status].label, color: STATUS_COLOR[status] })),
    rows: byLine.map((row) => ({
      label: row.service_line ? SERVICE_LINE_CONFIG[row.service_line].label : "No service line",
      values: Object.fromEntries(presentStatuses.map((status) => [status, row.counts[status]])),
    })),
  };
  const stateSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    format: "count",
    categoryLabel: "Delivery state",
    series: [{ key: "count", label: "Engagements", color: "series-1" }],
    rows: byState.map((row) => ({ label: DELIVERY_STATE_CONFIG[row.delivery_state].label, values: { count: row.count } })),
  };
  const phaseSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    format: "count",
    categoryLabel: "Current phase",
    series: [{ key: "count", label: "Engagements", color: "series-3" }],
    rows: byPhase.map((row) => ({ label: row.name ?? "No active phase", values: { count: row.count } })),
  };
  const throughputSpec: ChartSpec = {
    kind: "line",
    format: "count",
    categoryLabel: "Week",
    series: [
      { key: "created", label: "Created", color: "series-1" },
      { key: "completed", label: "Completed", color: "series-2" },
    ],
    rows: throughput.map((point) => ({
      label: shortWeekLabel(point.week_start),
      fullLabel: fullWeekLabel(point.week_start),
      values: { created: point.created, completed: point.completed },
    })),
  };
  const overdueSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    format: "count",
    categoryLabel: "Person",
    series: [{ key: "count", label: "Overdue tasks", color: "series-2" }],
    rows: overdueRows.map((row) => ({ label: row.user?.name ?? "Unassigned", values: { count: row.count } })),
  };
  const riskSpec: ChartSpec = {
    kind: "bar",
    orientation: "rows",
    stacked: true,
    format: "count",
    categoryLabel: "Category",
    series: [
      { key: "red", label: "High (15+)", color: "critical" },
      { key: "amber", label: "Medium (8 to 14)", color: "warning" },
      { key: "low", label: "Low", color: "good" },
      { key: "unscored", label: "Not scored", color: "muted" },
    ],
    rows: risks.map((row) => ({
      label: RISK_CATEGORY_CONFIG[row.category].label,
      values: { red: row.red, amber: row.amber, low: row.count - row.red - row.amber - row.unscored, unscored: row.unscored },
    })),
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Reveal>
          <KpiTile
            label="Open engagements"
            icon={Briefcase}
            value={{ kind: "count", value: openCount }}
            hint={`${pluralize(health.at_risk.length, "needs", "need")} attention`}
          />
        </Reveal>
        <Reveal delay={0.035}>
          <KpiTile
            label="Off track"
            icon={OctagonAlert}
            tone={health.counts.red > 0 ? "danger" : "neutral"}
            value={{ kind: "count", value: health.counts.red }}
            hint={`${health.counts.amber} at risk`}
          />
        </Reveal>
        <Reveal delay={0.07}>
          <KpiTile
            label="Tasks on time"
            icon={CircleCheck}
            tone="success"
            value={{ kind: "percent", value: onTime.tasks.rate }}
            hint={onTime.tasks.total === 0 ? "No due-dated tasks completed in range" : `${onTime.tasks.on_time} of ${onTime.tasks.total} completed by their due date`}
          />
        </Reveal>
        <Reveal delay={0.105}>
          <KpiTile
            label="Overdue tasks"
            icon={AlarmClock}
            tone={overdue.tasks > 0 ? "warning" : "neutral"}
            value={{ kind: "count", value: overdue.tasks }}
            hint={`${pluralize(overdue.milestones, "phase")} · ${pluralize(overdue.projects, "project")} past due`}
          />
        </Reveal>
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2 3xl:grid-cols-3">
        <Reveal delay={0.05}>
          <PortfolioHealthCard report={health} today={today} cadenceDays={cadenceDays} timeZone={timeZone} className="h-full" />
        </Reveal>
        <Reveal delay={0.08}>
          <ReportChart
            title="Throughput"
            description={`Tasks created and completed per week. ${created} created, ${completed} completed (${rangeLabel(params.from, params.to)}).`}
            spec={throughputSpec}
            emptyText="No tasks were created or completed in this range."
            className="h-full"
          />
        </Reveal>
        <Reveal delay={0.11}>
          <Card className="flex h-full flex-col">
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>On-time delivery</CardTitle>
                <CardDescription>Items completed in the range that had a due date.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <OnTimeRow label="Tasks" stat={onTime.tasks} />
              <OnTimeRow label="Phases and milestones" stat={onTime.milestones} />
            </CardContent>
          </Card>
        </Reveal>
        <ReportChart
          title="Engagements by service line"
          description="Top-level projects per service line and status."
          spec={lineSpec}
          emptyText="No projects yet."
        />
        <ReportChart
          title="Delivery state"
          description="Open top-level engagements by delivery state."
          spec={stateSpec}
          emptyText="No open engagements."
        />
        <ReportChart
          title="Current phase"
          description="Open engagements by the phase they are in now."
          spec={phaseSpec}
          emptyText="No open engagements."
        />
        <ReportChart
          title="Overdue tasks by person"
          description="Open tasks past their due date."
          spec={overdueSpec}
          emptyText="Nothing is overdue. Nice work."
          footer={
            overdueRows.some((row) => row.user) ? (
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {overdueRows.slice(0, 6).map((row) =>
                  row.user ? (
                    <li key={row.user.id}>
                      <Link href={`/tasks?assignee=${encodeURIComponent(row.user.id)}`} className="font-medium text-accent hover:underline">
                        {row.user.name}&rsquo;s tasks
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            ) : null
          }
        />
        <ReportChart
          title="Risk exposure"
          description={`Open and mitigating RAID items by category and severity (${pluralize(
            risks.reduce((sum, row) => sum + row.count, 0),
            "item",
          )}).`}
          spec={riskSpec}
          emptyText="No open risks."
        />
        <EvalImprovementsCard rows={evals} className={cn(evals.length > 0 && "xl:col-span-2 3xl:col-span-1")} />
      </div>
    </div>
  );
}
