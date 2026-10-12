import type { Metadata } from "next";
import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { TeamTable } from "@/components/team/team-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { listLoggedMinutesThisWeek, listUserCostRates } from "@/lib/data/time";
import { getUserProjectCounts, listUsers } from "@/lib/data/users";
import { pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const currentUser = await requireUser();
  const isAdmin = currentUser.role === "admin";
  const today = await getWorkspaceToday();
  const [users, projectCounts, weekMinutes, costRates] = await Promise.all([
    listUsers({ includeInactive: true }),
    getUserProjectCounts(),
    listLoggedMinutesThisWeek(today),
    // ADMIN-ONLY: cost rates are loaded (and passed to the client table) only for admins.
    isAdmin ? listUserCostRates() : Promise.resolve(null),
  ]);

  const activeCount = users.filter((user) => user.is_active).length;
  const inactiveCount = users.length - activeCount;
  const description =
    inactiveCount > 0
      ? `${pluralize(activeCount, "active member")} and ${inactiveCount} deactivated.`
      : `${pluralize(activeCount, "member")} at AvlysAI.`;

  return (
    <>
      <PageHeader
        title="Team"
        description={description}
        actions={isAdmin ? <AddMemberDialog /> : undefined}
      />
      <TeamTable
        users={users}
        projectCounts={projectCounts}
        currentUserId={currentUser.id}
        canManage={isAdmin}
        weekMinutes={weekMinutes}
        costRates={costRates ? Object.fromEntries(costRates.map((rate) => [rate.user_id, rate.cost_rate])) : undefined}
      />
    </>
  );
}
