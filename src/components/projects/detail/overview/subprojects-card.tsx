import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { countSubtree, getSubprojectTree } from "@/lib/data/projects";
import { percent } from "@/lib/utils";
import { ProjectTree } from "../project-tree";
import type { ProjectTabProps } from "../tabs/types";

/** Overview card: the sub-project tree with add / edit / delete per row and a completion meter. */
export async function SubprojectsCard({ project, users, viewer, isAdmin, today }: ProjectTabProps) {
  const [tree, subtree] = await Promise.all([
    getSubprojectTree(project.id, { includeCommercial: isAdmin }),
    countSubtree(project.id),
  ]);

  return (
    <Card>
      <CardHeader className="flex-wrap gap-y-2">
        <div className="flex items-center gap-2">
          <CardTitle id="project-subprojects-heading">Sub-projects</CardTitle>
          <Badge tone="neutral">{tree.length}</Badge>
        </div>
        {subtree.total > 0 ? (
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <ProgressBar
              value={percent(subtree.completed, subtree.total)}
              size="sm"
              className="w-20 sm:w-24"
              label="Sub-projects completed"
            />
            <span className="whitespace-nowrap tabular-nums">
              {subtree.completed}/{subtree.total} done
            </span>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <ProjectTree
          parent={{ id: project.id, name: project.name }}
          nodes={tree}
          users={users}
          viewer={{ id: viewer.id, role: viewer.role }}
          today={today}
        />
      </CardContent>
    </Card>
  );
}
