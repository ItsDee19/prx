import { Briefcase, Clock, ListChecks, Plus, TriangleAlert } from "lucide-react";
import { BentoGrid } from "@/components/dashboard/bento";
import {
  FULL_ROW_CLASS,
  TODAY_TILE_CLASS,
  TODAY_TILE_COMPACT_CLASS,
  closingTileClass,
} from "@/components/dashboard/bento-layout";
import { ContractValueTile } from "@/components/dashboard/contract-value-tile";
import { GatesTile } from "@/components/dashboard/gates-tile";
import { HealthStrip } from "@/components/dashboard/health-strip";
import { RunningTimerChip, UnreadChip } from "@/components/dashboard/home-status-chips";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { MilestonesTile } from "@/components/dashboard/milestones-tile";
import { MyProjects } from "@/components/dashboard/my-projects";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { RisksTile } from "@/components/dashboard/risks-tile";
import { TodayTile } from "@/components/dashboard/today-tile";
import { TuningTile } from "@/components/dashboard/tuning-tile";
import { UpdatesDueTile } from "@/components/dashboard/updates-due-tile";
import { Stagger } from "@/components/motion";
import { NewProjectWithTemplate } from "@/components/templates";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressRing } from "@/components/ui/progress-ring";
import { requireUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/data/app-settings";
import { getHomeData, type DayPart } from "@/lib/data/home";
import { listUserSummaries } from "@/lib/data/users";
import { formatHours, minutesToHours } from "@/lib/duration";
import type { UserSummary, WorkspaceDateContext } from "@/lib/types";
import { formatDate, percent, pluralize } from "@/lib/utils";
import { safeTimeZone, workspaceToday } from "@/lib/workspace-time";

export const metadata = { title: "Home" };

const GREETING: Record<DayPart, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

function NewProjectButton({
  users,
  today,
  size = "md",
}: {
  users: UserSummary[];
  /** Workspace today. */
  today: string;
  size?: "sm" | "md";
}) {
  return (
    <NewProjectWithTemplate
      users={users}
      today={today}
      trigger={
        <button type="button" className={buttonVariants({ size, variant: size === "sm" ? "secondary" : "primary" })}>
          <Plus aria-hidden />
          New project
        </button>
      }
    />
  );
}

/**
 * Home (bento): what needs me today and what is at risk. Workspace today,
 * timezone and update cadence are read once and passed down; each load also
 * runs the lazy time-based notification pass (inside getHomeData). Commercial
 * figures exist only for admins and render in server components.
 */
export default async function HomePage() {
  const [user, settings] = await Promise.all([requireUser(), getAppSettings()]);
  const timeZone = safeTimeZone(settings.workspace_timezone);
  const workspace: WorkspaceDateContext = {
    today: workspaceToday(timeZone),
    timeZone,
    cadenceDays: settings.update_cadence_days,
  };
  const { today } = workspace;
  const isAdmin = user.role === "admin";

  const [home, users] = await Promise.all([getHomeData(user, workspace), listUserSummaries()]);
  const { stats } = home;

  const hoursPct = stats.capacity_minutes > 0 ? percent(stats.hours_this_week_minutes, stats.capacity_minutes) : 0;
  const showGates = home.can_decide_gates;
  const showContract = isAdmin && home.contract_value !== null;
  // One-cell tiles after Today: gates?, updates, milestones, tuning, my projects, risks, contract?
  const singles = 5 + (showGates ? 1 : 0) + (showContract ? 1 : 0);
  // Today is a 2 x 2 block when it lists tasks; its empty state needs only one row.
  const todayHasTasks = home.my_work.overdue.length + home.my_work.today.length + home.my_work.this_week.length > 0;
  const todayRows = todayHasTasks ? 2 : 1;

  const timer = home.running_timer;
  const statusChips =
    timer || home.unread_count > 0 ? (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {timer ? (
          <RunningTimerChip
            startedAt={timer.started_at}
            projectName={timer.project.name}
            taskKey={timer.task?.key ?? null}
          />
        ) : null}
        {home.unread_count > 0 ? <UnreadChip count={home.unread_count} /> : null}
      </div>
    ) : null;

  return (
    <div>
      <PageHeader
        title={`${GREETING[home.greeting.day_part]}, ${home.greeting.first_name}`}
        description={
          <>
            <p>{formatDate(today, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
            {statusChips}
          </>
        }
        actions={<NewProjectButton users={users} today={today} />}
      />

      <Stagger as="section" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiTile
          label="Active engagements"
          value={stats.active_engagements}
          caption={stats.active_engagements === 0 ? "No open client projects yet." : "Open client projects."}
          icon={Briefcase}
          href="/projects"
        />
        <KpiTile
          label="My open tasks"
          value={stats.my_open_tasks}
          caption={
            stats.my_overdue_tasks > 0 ? (
              <span className="font-medium text-danger">{stats.my_overdue_tasks} overdue.</span>
            ) : stats.my_open_tasks === 0 ? (
              "Nothing assigned to you."
            ) : (
              "Nothing overdue."
            )
          }
          icon={ListChecks}
          tone="violet"
          href="/tasks"
          alert={stats.my_overdue_tasks > 0}
        />
        <KpiTile
          label="Hours this week"
          value={minutesToHours(stats.hours_this_week_minutes)}
          format={{ maximumFractionDigits: 1 }}
          suffix="h"
          caption={
            stats.capacity_minutes > 0
              ? `${hoursPct}% of ${formatHours(stats.capacity_minutes, 0)} capacity.`
              : "No weekly capacity set."
          }
          icon={Clock}
          href="/time"
          visual={
            <ProgressRing
              value={hoursPct}
              size={40}
              tone={hoursPct > 100 ? "danger" : hoursPct >= 90 ? "warning" : "accent"}
              label={`Hours this week: ${formatHours(stats.hours_this_week_minutes)} of ${formatHours(stats.capacity_minutes, 0)}`}
            />
          }
        />
        <KpiTile
          label="At-risk projects"
          value={stats.at_risk_projects}
          caption={
            stats.at_risk_projects === 0
              ? "None amber or red."
              : `${pluralize(stats.at_risk_projects, "project")} amber or red.`
          }
          icon={TriangleAlert}
          tone={stats.at_risk_projects > 0 ? "warning" : "neutral"}
          href="/projects?health=red&health=amber"
        />
      </Stagger>

      <BentoGrid className="mt-3 sm:mt-4">
        <HealthStrip
          portfolio={home.portfolio}
          counts={home.health_counts}
          className={FULL_ROW_CLASS}
          emptyAction={<NewProjectButton users={users} today={today} size="sm" />}
        />
        <TodayTile
          work={home.my_work}
          today={today}
          className={todayHasTasks ? TODAY_TILE_CLASS : TODAY_TILE_COMPACT_CLASS}
        />
        {showGates ? <GatesTile gates={home.gates} isAdmin={isAdmin} today={today} /> : null}
        {showContract && home.contract_value ? <ContractValueTile value={home.contract_value} /> : null}
        <UpdatesDueTile updates={home.stale_updates} viewerId={user.id} cadenceDays={workspace.cadenceDays} />
        <MilestonesTile milestones={home.milestones_due} />
        <TuningTile windows={home.tuning_ending} />
        <MyProjects
          projects={home.my_projects}
          workspace={workspace}
          emptyAction={<NewProjectButton users={users} today={today} size="sm" />}
        />
        <RisksTile risks={home.top_risks} overdueReviews={home.my_overdue_risk_reviews} />
        <RecentActivity activity={home.activity} className={closingTileClass(singles, todayRows)} />
      </BentoGrid>
    </div>
  );
}
