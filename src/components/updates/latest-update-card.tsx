import Link from "next/link";
import { ArrowRight, Clock, NotebookPen } from "lucide-react";
import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { UserAvatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RagDot } from "@/components/ui/rag-dot";
import { TimeAgo } from "@/components/ui/time-ago";
import { RAG_DIMENSIONS } from "@/lib/constants";
import { getAppSettings } from "@/lib/data/app-settings";
import { listStatusUpdates } from "@/lib/data/status-updates";
import { cn, formatDate, isUpdateDue } from "@/lib/utils";
import { safeTimeZone } from "@/lib/workspace-time";
import { ChangeChips } from "./change-chips";
import { HealthSparkline } from "./health-sparkline";

/** Updates loaded for the card's sparkline. */
const TREND_POINTS = 8;

/**
 * Overview card (server; SPEC.md section 21.2, side column order 10): the
 * latest status update with its health, headline and changes, a short health
 * trend, and "Update due" when an ongoing project has gone `update_cadence_days`
 * without an update (isUpdateDue in the workspace timezone).
 */
export async function LatestUpdateCard({ project, today }: ProjectTabProps) {
  const [updates, settings] = await Promise.all([listStatusUpdates(project.id, TREND_POINTS), getAppSettings()]);
  const latest = updates[0] ?? null;
  const timeZone = safeTimeZone(settings.workspace_timezone);
  const updateDue = isUpdateDue(project, today, settings.update_cadence_days, timeZone);
  const updatesHref = `/projects/${project.id}?tab=updates`;
  const composeHref = `${updatesHref}&compose=1`;
  const trend = [...updates].reverse().map((update) => ({ health: update.health, week_of: update.week_of }));
  const dimensions = latest ? RAG_DIMENSIONS.filter((dimension) => latest[dimension.key] !== null) : [];

  return (
    <Card className={cn(updateDue && "border-warning/40")}>
      <CardHeader className="pb-2">
        <div className="min-w-0">
          <CardTitle id="project-latest-update-heading">Latest update</CardTitle>
          {latest ? (
            <p className="mt-0.5 text-xs text-fg-muted">Week of {formatDate(latest.week_of)}</p>
          ) : null}
        </div>
        {updateDue ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-warning/12 px-2.5 text-xs font-medium text-fg ring-1 ring-inset ring-warning/35">
            <Clock aria-hidden className="size-3.5 text-warning" />
            Update due
          </span>
        ) : latest ? (
          <RagDot health={latest.health} showLabel size="md" />
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {latest ? (
          <>
            {updateDue ? <RagDot health={latest.health} showLabel /> : null}
            <p className="text-sm font-medium leading-6 text-fg [overflow-wrap:anywhere]">{latest.headline}</p>
            {dimensions.length > 0 ? (
              <dl className="flex flex-wrap gap-x-3 gap-y-1">
                {dimensions.map((dimension) => {
                  const health = latest[dimension.key];
                  return health ? (
                    <div key={dimension.key} className="flex items-center gap-1 text-xs">
                      <dt className="text-fg-muted">{dimension.label}</dt>
                      <dd>
                        <RagDot health={health} />
                      </dd>
                    </div>
                  ) : null;
                })}
              </dl>
            ) : null}
            <ChangeChips changes={latest.changes} />
            <div className="flex items-center justify-between gap-3">
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
                {latest.author ? <UserAvatar user={latest.author} size="xs" /> : null}
                <span className="truncate">{latest.author?.name ?? "Former member"}</span>
                <span aria-hidden>·</span>
                <TimeAgo date={latest.created_at} className="shrink-0" />
              </p>
              {trend.length > 1 ? <HealthSparkline points={trend} height={28} /> : null}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={updatesHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                All updates
                <ArrowRight aria-hidden />
              </Link>
              <Link
                href={composeHref}
                className={buttonVariants({ variant: updateDue ? "primary" : "ghost", size: "sm" })}
              >
                <NotebookPen aria-hidden />
                Post update
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              No updates yet. A weekly update sets the project&apos;s health everywhere it appears.
            </p>
            <Link href={composeHref} className={buttonVariants({ variant: updateDue ? "primary" : "outline", size: "sm" })}>
              <NotebookPen aria-hidden />
              Post the first update
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
