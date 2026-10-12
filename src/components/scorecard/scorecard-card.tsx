import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { listMetrics } from "@/lib/data/scorecard";
import { ScorecardPanel } from "./scorecard-panel";

/**
 * Overview card "Success scorecard" (server; SPEC.md §20.2 / §21.2, main
 * column order 20): loads the project's metrics with their eval-run trends
 * and hands serialisable props to the client ScorecardPanel. Every active
 * member may edit the scorecard (no commercial data here).
 */
export async function ScorecardCard({ project }: ProjectTabProps) {
  const metrics = await listMetrics(project.id);
  return (
    <section aria-labelledby="project-scorecard-heading">
      <ScorecardPanel projectId={project.id} metrics={metrics} serviceLine={project.service_line} canEdit />
    </section>
  );
}
