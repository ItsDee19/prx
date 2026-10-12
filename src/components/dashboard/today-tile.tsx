import { CircleCheckBig, ListChecks } from "lucide-react";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import type { HomeMyWork } from "@/lib/data/home";
import { pluralize } from "@/lib/utils";
import { BentoTile, TileEmpty, TileLink } from "./bento";
import { MyWorkList } from "./my-work-list";

export interface TodayTileProps {
  work: HomeMyWork;
  /** Workspace today. */
  today: string;
  className?: string;
}

/** "Today" focus tile: what needs me now (overdue, today, the rest of this week), ticked done in place. */
export function TodayTile({ work, today, className }: TodayTileProps) {
  const focusCount = work.overdue.length + work.today.length + work.this_week.length;
  const restCount = work.later_count + work.no_date_count;
  const description =
    focusCount === 0
      ? "Your assigned tasks due this week, overdue first."
      : work.overdue.length > 0
        ? `${pluralize(work.overdue.length, "task")} overdue, ${work.today.length} due today.`
        : `${work.today.length} due today, ${work.this_week.length} later this week.`;

  return (
    <BentoTile
      id="home-today"
      title="Today"
      icon={ListChecks}
      description={description}
      action={{ href: "/tasks", label: "My tasks" }}
      className={className}
    >
      {focusCount === 0 ? (
        <TileEmpty
          icon={CircleCheckBig}
          title="Nothing due this week."
          description={
            restCount > 0
              ? `${pluralize(restCount, "open task")} ${restCount === 1 ? "is" : "are"} due later or undated. Give the next one a due date to plan your week.`
              : "Tasks assigned to you with a due date land here, overdue first. Tick them off without leaving Home."
          }
          action={
            <>
              <NewTaskButton dueDate={today} label="Add a task for today" variant="secondary" size="sm" />
              <TileLink href="/tasks" label="Open My tasks" />
            </>
          }
        />
      ) : (
        <>
          <MyWorkList work={{ overdue: work.overdue, today: work.today, this_week: work.this_week }} today={today} />
          {restCount > 0 ? (
            <div className="mt-auto pt-4">
              <p className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-fg-muted">
                <span className="tabular-nums">
                  {work.later_count} later · {work.no_date_count} without a date
                </span>
                <TileLink href="/tasks" label="Plan the rest" />
              </p>
            </div>
          ) : null}
        </>
      )}
    </BentoTile>
  );
}
