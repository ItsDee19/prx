import type { Metadata } from "next";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { TabLinks } from "@/components/ui/tabs";
import { LogTimeButton } from "@/components/time/log-time-button";
import { ALL_USERS, TimeEntriesToolbar, TimeUserSwitcher } from "@/components/time/time-filters";
import { TimeEntryList } from "@/components/time/time-entry-list";
import { TimeWeekNav } from "@/components/time/time-week-nav";
import { TimesheetGrid } from "@/components/time/timesheet-grid";
import { requireUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { listProjectSummaries } from "@/lib/data/projects";
import { getPreviousWeekRows, getTimesheet, listTimeEntries } from "@/lib/data/time";
import { getUserById, listUserSummaries } from "@/lib/data/users";
import type { User } from "@/lib/types";
import { buildQueryString } from "@/lib/utils";
import { addDaysISO, isDateOnly, startOfWeekISO } from "@/lib/workspace-time";

export const metadata: Metadata = { title: "Time" };

type RawSearchParams = Record<string, string | string[] | undefined>;

interface TimePageProps {
  searchParams: Promise<RawSearchParams>;
}

type TimeTab = "timesheet" | "entries";

/** Entries listed on the Entries tab (CSV export has no cap beyond the data layer's maximum). */
const ENTRIES_LIMIT = 500;
/** Default Entries range: the last 30 days. */
const DEFAULT_RANGE_DAYS = 30;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * /time (SPEC.md section 19.1): `?tab=timesheet|entries`, `?week=YYYY-MM-DD`
 * (any day; the Monday-based week in the workspace timezone is shown), and
 * for admins `?user=<id>` (Entries also accepts `user=all`). Entries filters:
 * `?project&from&to&billable=1|0`.
 */
export default async function TimePage({ searchParams }: TimePageProps) {
  const [viewer, raw, today] = await Promise.all([requireUser(), searchParams, getWorkspaceToday()]);
  const isAdmin = viewer.role === "admin";
  const tab: TimeTab = first(raw.tab) === "entries" ? "entries" : "timesheet";

  const weekParam = first(raw.week);
  const weekStart = startOfWeekISO(isDateOnly(weekParam) ? weekParam : today);

  const userParam = first(raw.user);
  const everyone = isAdmin && tab === "entries" && userParam === ALL_USERS;
  let target: User = viewer;
  if (isAdmin && userParam && userParam !== ALL_USERS && userParam !== viewer.id) {
    target = (await getUserById(userParam)) ?? viewer;
  }
  const userQuery = everyone ? ALL_USERS : target.id === viewer.id ? undefined : target.id;

  const [projects, users] = await Promise.all([
    listProjectSummaries({ openOnly: true }),
    isAdmin ? listUserSummaries() : Promise.resolve([]),
  ]);

  const tabItems = [
    {
      id: "timesheet",
      label: "Timesheet",
      icon: "Table" as const,
      href: `/time${buildQueryString({ tab: "timesheet", week: weekParam ? weekStart : undefined, user: userQuery === ALL_USERS ? undefined : userQuery })}`,
    },
    {
      id: "entries",
      label: "Entries",
      icon: "Clock" as const,
      href: `/time${buildQueryString({ tab: "entries", user: userQuery })}`,
    },
  ];

  const isSelf = target.id === viewer.id && !everyone;
  const description = everyone
    ? "Everyone's time entries."
    : isSelf
      ? "Your week, your entries and your timers in one place."
      : `Viewing ${target.name}'s time.`;

  return (
    <div className="min-w-0">
      <PageHeader
        title="Time"
        description={description}
        actions={
          <>
            {isAdmin ? (
              <TimeUserSwitcher
                users={users}
                value={everyone ? ALL_USERS : target.id}
                viewerId={viewer.id}
                allowAll={tab === "entries"}
              />
            ) : null}
            <LogTimeButton projects={projects} today={today} />
          </>
        }
      />
      <TabLinks items={tabItems} activeId={tab} aria-label="Time views" className="mb-6" />
      {tab === "timesheet" ? (
        <TimesheetTab viewer={viewer} target={target} weekStart={weekStart} today={today} projects={projects} />
      ) : (
        <EntriesTab
          viewer={viewer}
          target={everyone ? null : target}
          raw={raw}
          today={today}
          projects={projects}
          userQuery={userQuery}
        />
      )}
    </div>
  );
}

async function TimesheetTab({
  viewer,
  target,
  weekStart,
  today,
  projects,
}: {
  viewer: User;
  target: User;
  weekStart: string;
  today: string;
  projects: Awaited<ReturnType<typeof listProjectSummaries>>;
}) {
  const [week, previousRows] = await Promise.all([getTimesheet(target.id, weekStart), getPreviousWeekRows(target.id, weekStart)]);
  const baseParams: Record<string, string> = { tab: "timesheet" };
  if (target.id !== viewer.id) baseParams.user = target.id;
  const exportHref = `/api/export/time${buildQueryString({
    from: week.days[0],
    to: week.days[6],
    user: target.id === viewer.id ? undefined : target.id,
  })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimeWeekNav weekStart={week.week_start} today={today} baseParams={baseParams} />
        <a href={exportHref} download className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <Download aria-hidden />
          Export week
        </a>
      </div>
      <TimesheetGrid
        key={`${target.id}:${week.week_start}`}
        week={week}
        previousRows={previousRows}
        projects={projects}
        userId={target.id}
        viewerId={viewer.id}
        today={today}
        capacityHours={target.weekly_capacity_hours}
      />
    </div>
  );
}

async function EntriesTab({
  viewer,
  target,
  raw,
  today,
  projects,
  userQuery,
}: {
  viewer: User;
  /** null = everyone (admins). */
  target: User | null;
  raw: RawSearchParams;
  today: string;
  projects: Awaited<ReturnType<typeof listProjectSummaries>>;
  userQuery: string | undefined;
}) {
  // Filters and edits reach closed projects too (their entries stay listed).
  const allProjects = await listProjectSummaries();
  const projectParam = first(raw.project) ?? "";
  const projectId = allProjects.some((project) => project.id === projectParam) ? projectParam : "";
  const fromParam = first(raw.from);
  const toParam = first(raw.to);
  const to = isDateOnly(toParam) ? toParam : today;
  const from = isDateOnly(fromParam) ? fromParam : addDaysISO(to, -(DEFAULT_RANGE_DAYS - 1));
  const billableParam = first(raw.billable);
  const billable = billableParam === "1" || billableParam === "0" ? billableParam : "";

  const entries = await listTimeEntries({
    userId: target?.id,
    projectId: projectId || undefined,
    from,
    to,
    billable: billable === "" ? undefined : billable === "1",
    limit: ENTRIES_LIMIT,
  });
  const total = entries.reduce((sum, entry) => sum + entry.minutes, 0);

  return (
    <div className="space-y-5">
      <TimeEntriesToolbar
        projects={allProjects}
        projectId={projectId}
        from={from}
        to={to}
        billable={billable}
        exportQuery={{ from, to, project: projectId || null, user: userQuery === ALL_USERS ? null : (userQuery ?? null) }}
      />
      <p className="text-sm text-fg-muted" aria-live="polite">
        {entries.length === 0
          ? "No entries in this range."
          : `${entries.length}${entries.length === ENTRIES_LIMIT ? "+" : ""} ${entries.length === 1 ? "entry" : "entries"}, ${Math.round((total / 60) * 10) / 10}h in total.`}
      </p>
      <TimeEntryList
        entries={entries}
        projects={projects}
        viewerId={viewer.id}
        isAdmin={viewer.role === "admin"}
        today={today}
        showUser={target === null || target.id !== viewer.id}
        emptyTitle="No time in this range."
        emptyDescription="Change the dates or filters, or log time."
      />
    </div>
  );
}
