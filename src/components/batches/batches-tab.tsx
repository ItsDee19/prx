import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { getWorkspaceTimezone } from "@/lib/data/app-settings";
import { listBatches, summarizeBatches } from "@/lib/data/batches";
import { listMilestoneRefs } from "@/lib/data/milestones";
import { BatchesPanel } from "./batches-panel";

/**
 * The project page's Batches tab (server; SPEC.md sections 17.6 and 20.2):
 * the Avlys Data batch tracker. Accepted units per week are bucketed by the
 * Monday of the workspace-timezone date of acceptance.
 */
export async function BatchesTab({ project, viewer, isAdmin, today }: ProjectTabProps) {
  const [batches, milestones, timeZone] = await Promise.all([
    listBatches(project.id),
    listMilestoneRefs(project.id),
    getWorkspaceTimezone(),
  ]);
  // Same result as getBatchSummary(project.id, timeZone), without reading the batches twice.
  const summary = summarizeBatches(batches, timeZone);

  return (
    <BatchesPanel
      projectId={project.id}
      projectName={project.name}
      batches={batches}
      summary={summary}
      milestones={milestones}
      progressMode={project.progress_mode}
      progress={project.progress}
      today={today}
      canDelete={isAdmin || project.owner_id === viewer.id}
    />
  );
}
