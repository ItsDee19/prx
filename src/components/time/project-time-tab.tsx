import { Download, Layers, ListChecks, Timer, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ProgressRing } from "@/components/ui/progress-ring";
import { listProjectSummaries } from "@/lib/data/projects";
import { getProjectMargin, getProjectTimeSummary, listTimeEntries } from "@/lib/data/time";
import { formatHours, formatMinutes, minutesToHours } from "@/lib/duration";
import type { ProjectMargin, ProjectSummary, ProjectTimeSummary } from "@/lib/types";
import { buildQueryString, cn, percent } from "@/lib/utils";
import { BudgetBurnBar, burnRingTone } from "./budget-burn-bar";
import { LogTimeButton } from "./log-time-button";
import { TimeEntryList } from "./time-entry-list";

/** Latest entries listed on the tab. */
const TAB_ENTRY_LIMIT = 50;

/**
 * The project page's Time tab (server; SPEC.md sections 17.7 and 20.2):
 * totals, billable share and budget burn (ProgressRing + BudgetBurnBar), hours
 * by person and by phase, estimate against actual per task, the latest
 * entries, and for admins only the approximate margin per phase.
 */
export async function ProjectTimeTab({ project, viewer, isAdmin, today }: ProjectTabProps) {
  const [summary, entries, projects, margin] = await Promise.all([
    getProjectTimeSummary(project.id, today),
    listTimeEntries({ projectId: project.id, limit: TAB_ENTRY_LIMIT }),
    listProjectSummaries({ openOnly: true }),
    isAdmin ? getProjectMargin(project.id) : Promise.resolve(null),
  ]);

  const self: ProjectSummary = {
    id: project.id,
    name: project.name,
    color: project.color,
    status: project.status,
    client_code: project.client?.code ?? null,
  };
  const pickerProjects = projects.some((item) => item.id === project.id) ? projects : [self, ...projects];
  const billablePct = percent(summary.billable_minutes, summary.total_minutes);
  const exportHref = `/api/export/time${buildQueryString({ project: project.id })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-muted">
          {summary.total_minutes > 0
            ? `${formatMinutes(summary.total_minutes)} logged by ${summary.by_user.length} ${summary.by_user.length === 1 ? "person" : "people"}.`
            : "No time logged on this project yet."}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={exportHref} className={buttonVariants({ variant: "outline" })} download>
            <Download aria-hidden />
            {isAdmin ? "Export CSV" : "Export my time"}
          </a>
          <LogTimeButton projects={pickerProjects} today={today} defaultProjectId={project.id} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Logged" icon={<Timer aria-hidden className="size-4" />}>
          <NumberTicker value={minutesToHours(summary.total_minutes)} format={{ maximumFractionDigits: 1 }} suffix="h" />
        </Kpi>
        <Kpi label="Billable" icon={<Badge tone="green">{formatHours(summary.billable_minutes)}</Badge>}>
          <NumberTicker value={billablePct} suffix="%" />
        </Kpi>
        <Kpi label="People" icon={<Users aria-hidden className="size-4" />}>
          <NumberTicker value={summary.by_user.length} />
        </Kpi>
        <Kpi
          label={summary.budget ? "Budget used" : "No hours budget"}
          icon={
            summary.budget ? (
              <ProgressRing
                value={summary.budget.burn_pct}
                size={36}
                tone={burnRingTone(summary.budget.burn_pct)}
                label="Hours budget used"
              />
            ) : null
          }
        >
          {summary.budget ? <NumberTicker value={summary.budget.burn_pct} suffix="%" /> : <span className="text-fg-muted">—</span>}
        </Kpi>
      </div>

      {summary.budget ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="min-w-0">
              <CardTitle>Budget burn</CardTitle>
              <CardDescription>
                {summary.budget.period === "monthly"
                  ? `${summary.budget.budget_hours} hours a month.`
                  : `${summary.budget.budget_hours} hours for the engagement.`}{" "}
                The marker shows how much of the time has passed.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <BudgetBurnBar burn={summary.budget} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <ByPersonCard summary={summary} />
        <ByPhaseCard summary={summary} />
      </div>

      <EstimateCard summary={summary} />

      {margin ? <MarginCard margin={margin} /> : null}

      <section aria-labelledby="project-time-entries" className="space-y-3">
        <h2 id="project-time-entries" className="text-base font-semibold text-fg">
          Latest entries
        </h2>
        <TimeEntryList
          entries={entries}
          projects={pickerProjects}
          viewerId={viewer.id}
          isAdmin={isAdmin}
          today={today}
          showProject={false}
          emptyTitle="No time logged yet."
          emptyDescription="Log time or start a timer on a task in this project."
        />
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function Kpi({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        <p className="mt-1 font-mono text-2xl font-semibold leading-8 tabular-nums text-fg">{children}</p>
      </div>
      <span className="shrink-0 text-fg-muted">{icon}</span>
    </Card>
  );
}

function ShareBar({ value, className }: { value: number; className?: string }) {
  return (
    <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
      <span
        className={cn("progress-fill block h-full w-full rounded-full", className ?? "bg-accent")}
        style={{ transform: `scaleX(${Math.min(100, Math.max(0, value)) / 100})` }}
      />
    </span>
  );
}

function ByPersonCard({ summary }: { summary: ProjectTimeSummary }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Users aria-hidden className="size-4 text-fg-muted" />
            By person
          </CardTitle>
          <CardDescription>Hours and billable share per person.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {summary.by_user.length === 0 ? (
          <p className="text-sm text-fg-muted">Nobody has logged time yet.</p>
        ) : (
          <ul className="space-y-3">
            {summary.by_user.map((row) => (
              <li key={row.user.id} className="space-y-1.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar user={row.user} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{row.user.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                    {percent(row.billable_minutes, row.minutes)}% billable
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-fg">
                    {formatHours(row.minutes)}
                  </span>
                </div>
                <ShareBar value={percent(row.minutes, summary.total_minutes)} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ByPhaseCard({ summary }: { summary: ProjectTimeSummary }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Layers aria-hidden className="size-4 text-fg-muted" />
            By phase
          </CardTitle>
          <CardDescription>Time on a task counts toward the task&apos;s phase.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {summary.by_milestone.length === 0 ? (
          <p className="text-sm text-fg-muted">No time logged yet.</p>
        ) : (
          <ul className="space-y-3">
            {summary.by_milestone.map((row) => (
              <li key={row.milestone?.id ?? "none"} className="space-y-1.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cn("min-w-0 flex-1 truncate text-sm", row.milestone ? "font-medium text-fg" : "text-fg-muted")}>
                    {row.milestone?.name ?? "No phase"}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                    {percent(row.minutes, summary.total_minutes)}%
                  </span>
                  <span className="w-16 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-fg">
                    {formatHours(row.minutes)}
                  </span>
                </div>
                <ShareBar value={percent(row.minutes, summary.total_minutes)} className={row.milestone ? "bg-accent-2" : "bg-fg-subtle"} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EstimateCard({ summary }: { summary: ProjectTimeSummary }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <ListChecks aria-hidden className="size-4 text-fg-muted" />
            Estimate vs actual
          </CardTitle>
          <CardDescription>Tasks with an estimate or logged time, most logged first.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {summary.by_task.length === 0 ? (
          <p className="text-sm text-fg-muted">Add estimates to tasks to compare them with logged time.</p>
        ) : (
          <ul className="divide-y divide-border">
            {summary.by_task.map((row) => {
              const estimate = row.estimate_minutes ?? 0;
              const over = estimate > 0 ? row.logged_minutes - estimate : 0;
              const ratio = estimate > 0 ? percent(row.logged_minutes, estimate) : null;
              return (
                <li key={row.task.id} className="grid gap-1.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center sm:gap-4">
                  <a
                    href={`/tasks/${row.task.key}`}
                    className="flex min-w-0 items-baseline gap-2 text-sm outline-none hover:text-accent focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="shrink-0 font-mono text-xs text-fg-muted">{row.task.key}</span>
                    <span className="truncate text-fg">{row.task.title}</span>
                  </a>
                  <div className="space-y-1">
                    <p className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                      <span className="font-mono text-fg">
                        {formatHours(row.logged_minutes)}
                        <span className="text-fg-muted"> / {estimate > 0 ? formatHours(estimate) : "no estimate"}</span>
                      </span>
                      {over > 0 ? (
                        <span className="font-medium text-danger">{formatHours(over)} over</span>
                      ) : ratio !== null ? (
                        <span className="text-fg-muted">{ratio}%</span>
                      ) : null}
                    </p>
                    {ratio !== null ? (
                      <ShareBar value={ratio} className={over > 0 ? "bg-danger" : ratio >= 90 ? "bg-warning" : "bg-success"} />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** ADMIN-ONLY. Rendered on the server only when the viewer is an admin. */
function MarginCard({ margin }: { margin: ProjectMargin }) {
  const priced = margin.phases.filter((phase) => phase.price !== null || phase.minutes > 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            Approximate margin
            <Badge tone="violet">Admin</Badge>
          </CardTitle>
          <CardDescription>
            Logged hours × cost rates against the contract and phase prices. USD converts at ₹{margin.usd_inr_rate} per $1.
            Approximate.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {margin.project ? (
          <dl className="grid gap-3 rounded-xl bg-surface-2/50 p-4 sm:grid-cols-4">
            <MarginStat label="Contract value">
              <Money amount={margin.project.contract_value} currency={margin.project.currency} />
            </MarginStat>
            <MarginStat label="Cost">
              <Money amount={margin.project.cost_inr} currency="INR" />
            </MarginStat>
            <MarginStat label="Margin (approx.)">
              <Money
                amount={margin.project.approx_margin_inr}
                currency="INR"
                className={margin.project.approx_margin_inr < 0 ? "text-danger" : undefined}
              />
            </MarginStat>
            <MarginStat label="Margin %">
              {margin.project.margin_pct === null ? "—" : `${margin.project.margin_pct}%`}
            </MarginStat>
          </dl>
        ) : (
          <p className="text-sm text-fg-muted">Set a contract value and currency to see the project margin.</p>
        )}
        {priced.length > 0 ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">Approximate margin per phase</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-fg-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Phase</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Hours</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Price</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Cost</th>
                  <th scope="col" className="py-2 text-right font-medium">Margin (approx.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {priced.map((phase) => (
                  <tr key={phase.milestone.id}>
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-fg">{phase.milestone.name}</th>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{formatHours(phase.minutes)}</td>
                    <td className="py-2 pr-3 text-right">
                      {phase.currency ? <Money amount={phase.price} currency={phase.currency} /> : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Money amount={phase.cost_inr} currency="INR" />
                    </td>
                    <td className="py-2 text-right">
                      {phase.approx_margin_inr === null ? (
                        <span className="text-fg-muted">No price</span>
                      ) : (
                        <Money
                          amount={phase.approx_margin_inr}
                          currency="INR"
                          className={phase.approx_margin_inr < 0 ? "text-danger" : undefined}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MarginStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-fg">{children}</dd>
    </div>
  );
}
