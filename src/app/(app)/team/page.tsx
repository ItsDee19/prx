import type { Metadata } from "next";
import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { TeamTable } from "@/components/team/team-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getUserProjectCounts, listUsers } from "@/lib/data/users";
import { pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const currentUser = await requireUser();
  const users = listUsers({ includeInactive: true });
  const projectCounts = getUserProjectCounts();
  const isAdmin = currentUser.role === "admin";

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
      />
    </>
  );
}
