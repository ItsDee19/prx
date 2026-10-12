import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RISK_KIND_ORDER } from "@/lib/constants";
import { getRiskHeatmap, listRisks } from "@/lib/data/risks";
import type { RiskKind } from "@/lib/types";
import { pluralize } from "@/lib/utils";
import { NewRiskButton } from "./new-risk-button";
import { RiskHeatmap } from "./risk-heatmap";
import { RiskTable } from "./risk-table";
import { RisksToolbar } from "./risks-toolbar";
import {
  impactLabel,
  isReviewOverdue,
  likelihoodLabel,
  matchesExceptKind,
  parseRiskFilters,
  risksHref,
} from "./risk-utils";

/**
 * The project page's Risks tab (server; SPEC.md section 20.2): the RAID log
 * with kind tabs, status / category / owner filters, a 5 x 5 heat map whose
 * cells filter the table (`?l=<likelihood>&i=<impact>`) and the table itself.
 * `?new=1` opens the add dialog.
 */
export async function RisksTab({ project, viewer, isAdmin, users, today, searchParams }: ProjectTabProps) {
  const filters = parseRiskFilters(searchParams);
  const [all, cells] = await Promise.all([listRisks({ projectId: project.id }), getRiskHeatmap(project.id)]);

  const visibleExceptKind = all.filter((risk) => matchesExceptKind(risk, filters, viewer.id));
  const kindCounts = Object.fromEntries(RISK_KIND_ORDER.map((kind) => [kind, 0])) as Record<RiskKind, number>;
  for (const risk of visibleExceptKind) kindCounts[risk.kind] += 1;
  const rows = filters.kind ? visibleExceptKind.filter((risk) => risk.kind === filters.kind) : visibleExceptKind;

  const selected =
    filters.likelihood !== null && filters.impact !== null
      ? { likelihood: filters.likelihood, impact: filters.impact }
      : null;
  const linkBase = risksHref(project.id, { ...filters, likelihood: null, impact: null });
  const clearHref = risksHref(project.id, {});
  const filtered =
    filters.kind !== null ||
    filters.status !== "active" ||
    filters.category !== null ||
    filters.owner !== null ||
    selected !== null;
  const openItems = all.filter((risk) => risk.status === "open" || risk.status === "mitigating");
  const overdueReviews = openItems.filter((risk) => isReviewOverdue(risk, today)).length;
  const unscored = openItems.filter((risk) => risk.score === null && risk.kind !== "decision").length;
  const autoOpen = (Array.isArray(searchParams.new) ? searchParams.new[0] : searchParams.new) === "1";
  const canManageAll = isAdmin || project.owner_id === viewer.id;

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] 3xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-wrap items-start justify-between gap-3 xl:col-span-2">
        <div className="min-w-0">
          <h2 id="raid-heading" className="text-base font-semibold text-fg">
            RAID log
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            Risks, assumptions, issues, dependencies and decisions.
            {overdueReviews > 0 ? (
              <span className="font-medium text-danger">
                {" "}
                {pluralize(overdueReviews, "review")} overdue.
              </span>
            ) : null}
          </p>
        </div>
        <NewRiskButton projectId={project.id} users={users} defaultKind={filters.kind} autoOpen={autoOpen} />
      </div>

      <aside aria-labelledby="heatmap-heading" className="min-w-0 xl:col-start-2 xl:row-start-2">
        <Card className="xl:sticky xl:top-20">
          <CardHeader className="pb-2">
            <div className="min-w-0">
              <CardTitle id="heatmap-heading">Heat map</CardTitle>
              <CardDescription className="text-xs">
                {openItems.length > 0
                  ? `${pluralize(openItems.length, "open item")}. Select a cell to filter the list.`
                  : "Open items appear here by likelihood and impact."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <RiskHeatmap cells={cells} selected={selected} linkBase={linkBase} className="max-w-sm xl:max-w-none" />
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted" aria-label="Score zones">
              <li>Low: 1 to 7</li>
              <li>Medium: 8 to 14</li>
              <li>High: 15 to 25</li>
            </ul>
            {unscored > 0 ? (
              <p className="text-xs text-fg-muted">
                {pluralize(unscored, "open item")} without likelihood or impact {unscored === 1 ? "is" : "are"} not on the map.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </aside>
      <section aria-labelledby="raid-heading" className="min-w-0 space-y-4 xl:col-start-1 xl:row-start-2">
        {all.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Nothing in the RAID log yet."
            description="Log what could go wrong (data access, PII, hallucination, model churn), what you assume, and what you need from the client."
          />
        ) : (
          <>
            <RisksToolbar
              projectId={project.id}
              filters={filters}
              kindCounts={kindCounts}
              users={users}
              resultCount={rows.length}
              filtered={filtered}
              clearHref={clearHref}
            />
            {selected ? (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
                Showing likelihood {selected.likelihood} ({likelihoodLabel(selected.likelihood)}) × impact{" "}
                {selected.impact} ({impactLabel(selected.impact)}).
                <Link
                  href={linkBase}
                  scroll={false}
                  className="rounded font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Show every cell
                </Link>
              </p>
            ) : null}
            {rows.length === 0 ? (
              <EmptyState
                title="No items match these filters."
                description="Change a filter or clear them to see the whole log."
                action={
                  <Link
                    href={clearHref}
                    scroll={false}
                    className="rounded text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Clear filters
                  </Link>
                }
              />
            ) : (
              <RiskTable risks={rows} users={users} today={today} viewerId={viewer.id} canManageAll={canManageAll} />
            )}
          </>
        )}
      </section>

    </div>
  );
}
