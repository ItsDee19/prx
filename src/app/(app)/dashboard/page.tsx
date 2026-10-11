import { AlertTriangle, CalendarClock, FolderKanban, Play, Plus } from "lucide-react";
import { MyProjects } from "@/components/dashboard/my-projects";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusOverview } from "@/components/dashboard/status-overview";
import { UpcomingDeadlines } from "@/components/dashboard/upcoming-deadlines";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { listRecentActivity } from "@/lib/data/activity";
import {
  getProjectStats,
  listMyProjects,
  listUpcomingDeadlines,
} from "@/lib/data/projects";
import { listUserSummaries } from "@/lib/data/users";
import type { UserSummary } from "@/lib/types";
import { formatDate, pluralize, todayISODate } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function NewProjectButton({ users, size = "md" }: { users: UserSummary[]; size?: "sm" | "md" }) {
  return (
    <ProjectDialog
      mode="create"
      users={users}
      trigger={
        <button type="button" className={buttonVariants({ size })}>
          <Plus aria-hidden />
          New project
        </button>
      }
    />
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();

  // Independent queries: run them concurrently (one round trip each to a remote DB).
  const [stats, myProjects, deadlines, activity, users] = await Promise.all([
    getProjectStats(),
    listMyProjects(user.id, 6),
    listUpcomingDeadlines(8),
    listRecentActivity(12),
    listUserSummaries(),
  ]);

  const ongoing = stats.by_status.ongoing;
  const open = stats.by_status.to_start + ongoing + stats.by_status.on_hold;

  return (
    <div>
      <PageHeader
        title={`${greeting(now)}, ${firstName(user.name)}`}
        description={formatDate(todayISODate(now), {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
        actions={<NewProjectButton users={users} />}
      />

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total projects"
          value={stats.total}
          caption={`${pluralize(open, "open project")}, ${stats.by_status.completed} completed`}
          icon={FolderKanban}
          tone="accent"
        />
        <StatCard
          label="Ongoing"
          value={ongoing}
          caption={
            stats.total === 0
              ? "Nothing in progress yet"
              : `${Math.round((ongoing / stats.total) * 100)}% of all projects`
          }
          icon={Play}
          tone="blue"
        />
        <StatCard
          label="Due this week"
          value={stats.due_this_week}
          caption="Open projects due in the next 7 days"
          icon={CalendarClock}
          tone="amber"
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          caption={stats.overdue > 0 ? "Past their due date and still open" : "Nothing past due"}
          icon={AlertTriangle}
          tone={stats.overdue > 0 ? "danger" : "neutral"}
        />
      </section>

      <StatusOverview stats={stats} className="mt-6" />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MyProjects projects={myProjects} emptyAction={<NewProjectButton users={users} size="sm" />} />
        <UpcomingDeadlines
          projects={deadlines}
          emptyAction={<NewProjectButton users={users} size="sm" />}
        />
      </div>

      <RecentActivity
        activity={activity}
        className="mt-6"
        emptyAction={<NewProjectButton users={users} size="sm" />}
      />
    </div>
  );
}
