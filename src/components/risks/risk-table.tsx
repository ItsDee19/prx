import { CalendarClock } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RISK_CATEGORY_CONFIG, RISK_KIND_CONFIG, RISK_STATUS_CONFIG } from "@/lib/constants";
import type { RiskWithMeta, UserSummary } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { RiskRowActions } from "./risk-row-actions";
import { RiskScoreBadge } from "./risk-score-badge";
import { dueDateLabel, isReviewOverdue } from "./risk-utils";

export interface RiskTableProps {
  risks: RiskWithMeta[];
  users: UserSummary[];
  today: string;
  viewerId: string;
  /** Admin or project owner: may delete any item. */
  canManageAll: boolean;
}

function StatusChip({ risk }: { risk: RiskWithMeta }) {
  const config = RISK_STATUS_CONFIG[risk.status];
  return (
    <Badge tone={config.tone} dot dotClassName={config.dotClass}>
      {config.label}
    </Badge>
  );
}

function KindChip({ risk }: { risk: RiskWithMeta }) {
  const config = RISK_KIND_CONFIG[risk.kind];
  return (
    <Badge tone={config.tone}>
      <Icon name={config.icon} aria-hidden className="size-3" />
      {config.label}
    </Badge>
  );
}

function CategoryChip({ risk }: { risk: RiskWithMeta }) {
  const config = RISK_CATEGORY_CONFIG[risk.category];
  return (
    <span className="inline-flex h-5 max-w-full items-center gap-1 truncate rounded-full border border-border px-2 text-xs text-fg-muted">
      <Icon name={config.icon} aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{config.label}</span>
    </span>
  );
}

function ReviewDate({ risk, today }: { risk: RiskWithMeta; today: string }) {
  if (!risk.review_date) return <span className="text-fg-subtle">—</span>;
  const overdue = isReviewOverdue(risk, today);
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap tabular-nums", overdue ? "font-medium text-danger" : "text-fg-muted")}>
      {overdue ? <CalendarClock aria-hidden className="size-3.5" /> : null}
      {formatDate(risk.review_date, { month: "short", day: "numeric" })}
      {overdue ? <span className="sr-only">, review overdue</span> : null}
    </span>
  );
}

function DueDate({ risk, today }: { risk: RiskWithMeta; today: string }) {
  if (!risk.due_date) return <span className="text-fg-subtle">—</span>;
  const overdue = risk.status !== "closed" && risk.due_date < today;
  return (
    <span className={cn("whitespace-nowrap tabular-nums", overdue ? "font-medium text-danger" : "text-fg-muted")}>
      {formatDate(risk.due_date, { month: "short", day: "numeric" })}
      {overdue ? <span className="sr-only">, overdue</span> : null}
    </span>
  );
}

function Owner({ risk }: { risk: RiskWithMeta }) {
  if (!risk.owner) return <span className="text-sm text-fg-subtle">No owner</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar user={risk.owner} size="xs" />
      <span className="truncate text-sm text-fg">{risk.owner.name}</span>
    </span>
  );
}

/**
 * RAID table: score badge, title with type and category, owner, status,
 * review date (red when overdue) and due / confirm-by date, plus a row menu.
 * A table from `md`; stacked cards below.
 */
export function RiskTable({ risks, users, today, viewerId, canManageAll }: RiskTableProps) {
  return (
    <>
      <ul className="space-y-2 md:hidden" aria-label="RAID items">
        {risks.map((risk) => (
          <li
            key={risk.id}
            className={cn(
              "min-w-0 rounded-2xl border border-border bg-surface p-3 shadow-card",
              risk.status === "closed" && "opacity-75",
            )}
          >
            <div className="flex items-start gap-2">
              <RiskScoreBadge likelihood={risk.likelihood} impact={risk.impact} />
              <p className="min-w-0 flex-1 pt-0.5 text-sm font-medium text-fg [overflow-wrap:anywhere]">{risk.title}</p>
              <RiskRowActions risk={risk} users={users} canDelete={canManageAll || risk.created_by === viewerId} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <KindChip risk={risk} />
              <CategoryChip risk={risk} />
              <StatusChip risk={risk} />
            </div>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div className="col-span-2 flex min-w-0 items-center gap-2">
                <dt className="sr-only">Owner</dt>
                <dd className="min-w-0">
                  <Owner risk={risk} />
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-fg-muted">Review</dt>
                <dd>
                  <ReviewDate risk={risk} today={today} />
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-fg-muted">{dueDateLabel(risk.kind)}</dt>
                <dd>
                  <DueDate risk={risk} today={today} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-card md:block">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">RAID items</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-fg-muted">
              <th scope="col" className="w-28 px-4 py-2.5 font-medium">
                Score
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Item
              </th>
              <th scope="col" className="hidden w-44 px-3 py-2.5 font-medium lg:table-cell">
                Owner
              </th>
              <th scope="col" className="w-32 px-3 py-2.5 font-medium">
                Status
              </th>
              <th scope="col" className="w-24 px-3 py-2.5 font-medium">
                Review
              </th>
              <th scope="col" className="hidden w-28 px-3 py-2.5 font-medium xl:table-cell">
                Due / confirm by
              </th>
              <th scope="col" className="w-12 px-2 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {risks.map((risk) => (
              <tr
                key={risk.id}
                className={cn(
                  "align-top transition-colors duration-150 hover:bg-surface-2/50",
                  risk.status === "closed" && "text-fg-muted",
                )}
              >
                <td className="px-4 py-3">
                  <RiskScoreBadge likelihood={risk.likelihood} impact={risk.impact} />
                </td>
                <td className="min-w-0 px-3 py-3">
                  <p
                    className={cn(
                      "font-medium [overflow-wrap:anywhere]",
                      risk.status === "closed" ? "text-fg-muted line-through decoration-fg-subtle/60" : "text-fg",
                    )}
                  >
                    {risk.title}
                  </p>
                  {risk.mitigation ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted [overflow-wrap:anywhere]">
                      <span className="font-medium">{risk.kind === "decision" ? "Rationale" : "Mitigation"}:</span>{" "}
                      {risk.mitigation}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <KindChip risk={risk} />
                    <CategoryChip risk={risk} />
                    <span className="lg:hidden">
                      {risk.owner ? (
                        <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                          <UserAvatar user={risk.owner} size="xs" />
                          {risk.owner.name}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  <Owner risk={risk} />
                </td>
                <td className="px-3 py-3">
                  <StatusChip risk={risk} />
                </td>
                <td className="px-3 py-3 text-xs">
                  <ReviewDate risk={risk} today={today} />
                </td>
                <td className="hidden px-3 py-3 text-xs xl:table-cell">
                  <span className="sr-only">{dueDateLabel(risk.kind)}: </span>
                  <DueDate risk={risk} today={today} />
                </td>
                <td className="px-2 py-2">
                  <RiskRowActions risk={risk} users={users} canDelete={canManageAll || risk.created_by === viewerId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
