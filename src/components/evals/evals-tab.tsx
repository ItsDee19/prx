import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { getWorkspaceTimezone } from "@/lib/data/app-settings";
import { listEvalMetricInfo, listEvalRuns, listMetricNames } from "@/lib/data/evals";
import { listMilestoneRefs } from "@/lib/data/milestones";
import { EvalsPanel } from "./evals-panel";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The project page's Evals tab (server; SPEC.md sections 17.6 and 20.2):
 * the experiment and evaluation log. `?new=1` opens the Log run dialog (the
 * palette's "Log eval run" deep link, `?tab=evals&new=1`).
 */
export async function EvalsTab({ project, viewer, isAdmin, today, searchParams }: ProjectTabProps) {
  const [runs, scorecard, metricNames, milestones, timeZone] = await Promise.all([
    listEvalRuns(project.id),
    listEvalMetricInfo(project.id),
    listMetricNames(project.id),
    listMilestoneRefs(project.id),
    getWorkspaceTimezone(),
  ]);

  return (
    <EvalsPanel
      projectId={project.id}
      projectName={project.name}
      runs={runs}
      scorecard={scorecard}
      metricNames={metricNames}
      milestones={milestones}
      today={today}
      timeZone={timeZone}
      viewerId={viewer.id}
      isAdmin={isAdmin}
      ownerId={project.owner_id}
      autoOpen={firstParam(searchParams.new) === "1"}
    />
  );
}
