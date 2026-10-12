import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listComments } from "@/lib/data/comments";
import { CommentsSection } from "../comments-section";
import type { ProjectTabProps } from "../tabs/types";

/** Overview card: project-level comments (task comments live in the task drawer). */
export async function CommentsCard({ project, viewer, users }: ProjectTabProps) {
  const comments = await listComments(project.id);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle id="project-comments-heading">Comments</CardTitle>
          {comments.length > 0 ? <Badge tone="neutral">{comments.length}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent>
        <CommentsSection
          projectId={project.id}
          comments={comments}
          viewer={{ id: viewer.id, name: viewer.name, color: viewer.color, role: viewer.role }}
          users={users}
        />
      </CardContent>
    </Card>
  );
}
