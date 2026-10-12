import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { listMilestones } from "@/lib/data/milestones";
import { PhasesPanel } from "./phases-panel";

/**
 * Overview card "Phases" (SPEC.md sections 20.2 and 21.2): loads the project's
 * milestones on the server (prices only for admins) and hands serialisable
 * props to the client PhasesPanel. canDecideGate = admin or project owner.
 */
export async function PhasesCard(props: ProjectTabProps) {
  const { project, viewer, isAdmin } = props;
  // Loaded lazily (not a static import) so the tab registry, which imports the
  // overview cards, never forms an import cycle with this card.
  const [milestones, { visibleProjectTabs }] = await Promise.all([
    listMilestones(project.id, { includeCommercial: isAdmin }),
    import("@/components/projects/detail/tabs/registry"),
  ]);
  const isOwner = project.owner_id === viewer.id;
  const hasTasksTab = visibleProjectTabs(props).some((tab) => tab.id === "tasks");

  return (
    <section aria-labelledby="project-phases-heading">
      <PhasesPanel
        milestones={milestones}
        projectId={project.id}
        isAdmin={isAdmin}
        canEdit
        canDecideGate={isAdmin || isOwner}
        canDelete={isAdmin || isOwner}
        today={props.today}
        currency={project.currency}
        tasksHref={hasTasksTab ? `/projects/${project.id}?tab=tasks` : null}
      />
    </section>
  );
}
