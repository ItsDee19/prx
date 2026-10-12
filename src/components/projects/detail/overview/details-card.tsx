import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserById } from "@/lib/data/users";
import { DetailsPanel } from "../details-panel";
import type { ProjectTabProps } from "../tabs/types";

/** Overview side card: engagement, people, dates, budget and progress (never commercial amounts). */
export async function DetailsCard({ project, users, today }: ProjectTabProps) {
  // The creator may be deactivated (not in `users`), so resolve the name directly.
  const creator = users.find((user) => user.id === project.created_by) ?? (await getUserById(project.created_by));
  return (
    <Card>
      <CardHeader>
        <CardTitle id="project-details-heading">Details</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailsPanel
          project={project}
          users={users}
          createdByName={creator?.name ?? "Unknown user"}
          today={today}
        />
      </CardContent>
    </Card>
  );
}
