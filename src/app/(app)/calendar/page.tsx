import type { Metadata } from "next";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import { calendarRange } from "@/components/calendar/calendar-dates";
import { parseCalendarParams, resolveAssignee, type RawCalendarSearchParams } from "@/components/calendar/calendar-params";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { listCalendarItems } from "@/lib/data/calendar";
import { listClientSummaries } from "@/lib/data/clients";
import { listLabels } from "@/lib/data/labels";
import { listProjectSummaries } from "@/lib/data/projects";
import { listUserSummaries } from "@/lib/data/users";

export const metadata: Metadata = { title: "Calendar" };

interface CalendarPageProps {
  searchParams: Promise<RawCalendarSearchParams>;
}

/**
 * Calendar: task due dates, phase and milestone deadlines, gates, project due
 * dates, go-lives and tuning-window ends for a month (Monday first) or a week,
 * in the workspace timezone. URL: `?view=month|week&date=YYYY-MM-DD&scope=
 * mine|all&project=&client=&label=&assignee=` (SPEC §19.1); `?task=PRX-n`
 * opens the task drawer on top.
 */
export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const [user, raw, today] = await Promise.all([requireUser(), searchParams, getWorkspaceToday()]);
  const params = parseCalendarParams(raw, today);
  const range = calendarRange(params.view, params.date);

  const [items, users, projects, clients, labels] = await Promise.all([
    listCalendarItems({
      from: range.start,
      to: range.end,
      scope: params.scope,
      userId: user.id,
      projectId: params.projectId || undefined,
      clientId: params.clientId || undefined,
      labelId: params.labelId || undefined,
      assigneeId: params.scope === "all" ? resolveAssignee(params.assignee, user.id) : undefined,
    }),
    listUserSummaries(),
    listProjectSummaries(),
    listClientSummaries(),
    listLabels(),
  ]);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Calendar"
        description={
          params.scope === "mine"
            ? "Your tasks and the deadlines, gates and go-lives of your projects."
            : "Every task, deadline, gate and go-live across the workspace."
        }
        actions={<NewTaskButton projectId={params.projectId || undefined} />}
      />
      <CalendarScreen
        params={params}
        today={today}
        items={items}
        projects={projects}
        clients={clients}
        labels={labels}
        users={users}
        viewerId={user.id}
      />
    </div>
  );
}
