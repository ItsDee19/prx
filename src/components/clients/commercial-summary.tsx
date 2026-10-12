import { Lock, TrendingDown, TrendingUp } from "lucide-react";
import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { INVOICE_STATUS_CONFIG } from "@/lib/constants";
import { listMilestones } from "@/lib/data/milestones";
import { getProjectMargin } from "@/lib/data/time";
import { formatHours } from "@/lib/duration";
import { formatMoney } from "@/lib/money";
import { INVOICE_STATUSES, type InvoiceStatus, type ProjectMargin } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEGMENT_CLASS: Record<InvoiceStatus, string> = {
  paid: "bg-success",
  invoiced: "bg-accent",
  not_invoiced: "bg-fg/15",
};

/**
 * ADMIN-ONLY overview card: contract value, hourly rate and phase prices by
 * invoice status (all in the project's currency), plus the approximate margin
 * from logged time (project and per phase, `getProjectMargin`). Renders nothing
 * for members; the overview registry also hides it (`visible: ctx => ctx.isAdmin`).
 */
export async function CommercialSummary({ project, isAdmin }: ProjectTabProps) {
  if (!isAdmin) return null;
  const [milestones, margin] = await Promise.all([
    listMilestones(project.id, { includeCommercial: true }),
    getProjectMargin(project.id),
  ]);
  const priced = milestones.filter((milestone) => milestone.kind === "phase" && milestone.price !== null);
  const currency = project.currency;

  const byStatus: Record<InvoiceStatus, number> = { not_invoiced: 0, invoiced: 0, paid: 0 };
  for (const phase of priced) byStatus[phase.invoice_status ?? "not_invoiced"] += phase.price ?? 0;
  const phaseTotal = byStatus.not_invoiced + byStatus.invoiced + byStatus.paid;
  const hasAnything = project.contract_value !== null || project.hourly_rate !== null || priced.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Commercials</CardTitle>
          <CardDescription className="flex items-center gap-1 text-xs">
            <Lock className="size-3" aria-hidden />
            Only admins see this card.
          </CardDescription>
        </div>
        {currency ? <Badge tone="neutral">{currency}</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!currency ? (
          <p className="text-sm text-fg-muted">No currency yet. Pick one in Edit to record the contract value and phase prices.</p>
        ) : !hasAnything ? (
          <p className="text-sm text-fg-muted">No contract value or phase prices recorded. Add them in Edit and in the phase manager.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <div className="min-w-0 rounded-xl bg-surface-2/60 px-3 py-2.5">
                <dt className="text-xs text-fg-muted">Contract value</dt>
                <dd className="mt-0.5 truncate text-lg font-semibold tracking-tight text-fg">
                  {project.contract_value !== null ? <Money amount={project.contract_value} currency={currency} compact /> : <span className="text-sm font-normal text-fg-subtle">Not set</span>}
                </dd>
              </div>
              <div className="min-w-0 rounded-xl bg-surface-2/60 px-3 py-2.5">
                <dt className="text-xs text-fg-muted">Hourly rate</dt>
                <dd className="mt-0.5 truncate text-lg font-semibold tracking-tight text-fg">
                  {project.hourly_rate !== null ? (
                    <>
                      <Money amount={project.hourly_rate} currency={currency} />
                      <span className="text-xs font-normal text-fg-muted"> /h</span>
                    </>
                  ) : (
                    <span className="text-sm font-normal text-fg-subtle">Not set</span>
                  )}
                </dd>
              </div>
            </dl>

            {priced.length > 0 ? (
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-fg">Phase prices</span>
                  <span className="tabular-nums text-fg-muted">
                    {formatMoney(phaseTotal, currency)}
                    {project.contract_value !== null && project.contract_value !== phaseTotal
                      ? ` of ${formatMoney(project.contract_value, currency)}`
                      : ""}
                  </span>
                </div>
                <div
                  className="flex h-2 w-full overflow-hidden rounded-full bg-fg/[0.06]"
                  role="img"
                  aria-label={INVOICE_STATUSES.map(
                    (status) => `${INVOICE_STATUS_CONFIG[status].label} ${formatMoney(byStatus[status], currency)}`,
                  ).join(", ")}
                >
                  {phaseTotal > 0
                    ? (["paid", "invoiced", "not_invoiced"] as const).map((status) =>
                        byStatus[status] > 0 ? (
                          <span
                            key={status}
                            className={cn("h-full first:rounded-l-full last:rounded-r-full", SEGMENT_CLASS[status])}
                            style={{ width: `${(byStatus[status] / phaseTotal) * 100}%` }}
                          />
                        ) : null,
                      )
                    : null}
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {(["paid", "invoiced", "not_invoiced"] as const).map((status) => (
                    <li key={status} className="inline-flex items-center gap-1.5 text-fg-muted">
                      <span aria-hidden className={cn("size-2 rounded-full", SEGMENT_CLASS[status])} />
                      {INVOICE_STATUS_CONFIG[status].label}
                      <span className="font-medium tabular-nums text-fg">{formatMoney(byStatus[status], currency, { compact: true })}</span>
                    </li>
                  ))}
                </ul>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {priced.map((phase) => {
                    const status = phase.invoice_status ?? "not_invoiced";
                    const config = INVOICE_STATUS_CONFIG[status];
                    return (
                      <li key={phase.id} className="flex min-w-0 items-center gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-fg">{phase.name}</span>
                        <Badge tone={config.tone}>{config.label}</Badge>
                        <Money amount={phase.price} currency={currency} className="w-24 shrink-0 text-right text-fg" />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <MarginSummary margin={margin} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Signed INR amount for margins ("-₹12,000" when negative). */
function MarginAmount({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={cn("tabular-nums", amount < 0 ? "text-danger" : "text-fg", className)}>
      {formatMoney(amount, "INR")}
    </span>
  );
}

/**
 * Approximate margin (ADMIN-ONLY data, rendered inside the admin-only card):
 * contract value in INR minus logged cost (hours x cost rates), then per priced
 * phase. Always labelled approximate: USD converts at the admin-set rate and
 * people without a cost rate count as zero cost.
 */
function MarginSummary({ margin }: { margin: ProjectMargin }) {
  const phases = margin.phases.filter((phase) => phase.approx_margin_inr !== null);
  if (!margin.project && phases.length === 0) return null;
  const row = margin.project;
  const positive = row ? row.approx_margin_inr >= 0 : true;
  const TrendIcon = positive ? TrendingUp : TrendingDown;

  return (
    <section aria-labelledby="commercial-margin-heading" className="space-y-2.5 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="commercial-margin-heading" className="text-xs font-medium text-fg">
          Margin from logged time
        </h3>
        <Badge tone="amber">Approximate</Badge>
      </div>

      {row ? (
        <dl className="grid grid-cols-2 gap-3">
          <div className="min-w-0 rounded-xl bg-surface-2/60 px-3 py-2.5">
            <dt className="text-xs text-fg-muted">Approx. margin</dt>
            <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 text-lg font-semibold tracking-tight">
              <TrendIcon className={cn("size-4 shrink-0", positive ? "text-success" : "text-danger")} aria-hidden />
              <MarginAmount amount={row.approx_margin_inr} className="truncate" />
              {row.margin_pct !== null ? (
                <span className="text-xs font-normal tabular-nums text-fg-muted">{row.margin_pct}%</span>
              ) : null}
            </dd>
          </div>
          <div className="min-w-0 rounded-xl bg-surface-2/60 px-3 py-2.5">
            <dt className="text-xs text-fg-muted">Logged cost</dt>
            <dd className="mt-0.5 truncate text-lg font-semibold tracking-tight text-fg">
              <Money amount={row.cost_inr} currency="INR" compact />
              <span className="text-xs font-normal tabular-nums text-fg-muted"> · {formatHours(row.logged_minutes)}</span>
            </dd>
          </div>
        </dl>
      ) : null}

      {phases.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Approximate margin per phase">
          {phases.map((phase) => (
            <li key={phase.milestone.id} className="flex min-w-0 items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-fg">{phase.milestone.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-fg-muted">{formatHours(phase.minutes)}</span>
              {phase.approx_margin_inr !== null ? (
                <MarginAmount amount={phase.approx_margin_inr} className="w-24 shrink-0 text-right" />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-fg-muted">
        Contract and phase prices minus logged hours × cost rates. USD converts at ₹{margin.usd_inr_rate} per $1; people without a cost rate count as zero.
      </p>
    </section>
  );
}
