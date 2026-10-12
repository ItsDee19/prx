import Link from "next/link";
import { ArrowRight, CalendarClock, Plus } from "lucide-react";
import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { UserAvatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OPEN_RISK_STATUSES, RISK_KIND_CONFIG } from "@/lib/constants";
import { listRisks } from "@/lib/data/risks";
import { cn, formatDate, pluralize } from "@/lib/utils";
import { RiskScoreBadge } from "./risk-score-badge";
import { isReviewOverdue } from "./risk-utils";

/** Items shown on the card. */
const TOP_RISKS = 3;

/**
 * Overview card (server; SPEC.md section 21.2, side column order 30): the
 * three most severe open / mitigating RAID items (decisions excluded), with
 * score, owner and review date, plus the open and overdue-review counts.
 */
export async function TopRisksCard({ project, counts, today }: ProjectTabProps) {
  const open = await listRisks({
    projectId: project.id,
    status: OPEN_RISK_STATUSES,
    kind: ["risk", "issue", "dependency", "assumption"],
  });
  const top = open.slice(0, TOP_RISKS);
  const overdue = open.filter((risk) => isReviewOverdue(risk, today)).length;
  const risksHref = `/projects/${project.id}?tab=risks`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="min-w-0">
          <CardTitle id="project-top-risks-heading">Top risks</CardTitle>
          <CardDescription className="text-xs">
            {counts.open_risks > 0 ? `${counts.open_risks} open in the RAID log` : "Nothing open in the RAID log"}
            {overdue > 0 ? (
              <span className="font-medium text-danger">
                {" "}
                · {pluralize(overdue, "review")} overdue
              </span>
            ) : null}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {top.length === 0 ? (
          <p className="text-sm text-fg-muted">No open risks, issues or dependencies.</p>
        ) : (
          <ol className="space-y-2">
            {top.map((risk) => {
              const reviewOverdue = isReviewOverdue(risk, today);
              return (
                <li key={risk.id} className="flex min-w-0 items-start gap-2.5 rounded-xl bg-surface-2/50 px-3 py-2.5">
                  <RiskScoreBadge likelihood={risk.likelihood} impact={risk.impact} compact />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-fg [overflow-wrap:anywhere]">{risk.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
                      <span>{RISK_KIND_CONFIG[risk.kind].label}</span>
                      {risk.owner ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <UserAvatar user={risk.owner} size="xs" />
                          <span className="truncate">{risk.owner.name}</span>
                        </span>
                      ) : (
                        <span>No owner</span>
                      )}
                      {risk.review_date ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 tabular-nums",
                            reviewOverdue && "font-medium text-danger",
                          )}
                        >
                          <CalendarClock aria-hidden className="size-3" />
                          {reviewOverdue ? "Review overdue " : "Review "}
                          {formatDate(risk.review_date, { month: "short", day: "numeric" })}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={risksHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            RAID log
            <ArrowRight aria-hidden />
          </Link>
          <Link href={`${risksHref}&new=1`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Plus aria-hidden />
            Add risk
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
