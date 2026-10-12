import { NotebookPen } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import type { ProjectTabProps } from "@/components/projects/detail/tabs/types";
import { EmptyState } from "@/components/ui/empty-state";
import { RagDot } from "@/components/ui/rag-dot";
import { getAppSettings } from "@/lib/data/app-settings";
import { getStatusUpdateDraft, listStatusUpdates } from "@/lib/data/status-updates";
import { isUpdateDue, pluralize } from "@/lib/utils";
import { safeTimeZone } from "@/lib/workspace-time";
import { HealthSparkline } from "./health-sparkline";
import { UpdateCard } from "./update-card";
import { UpdateComposer } from "./update-composer";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The project page's Updates tab (server; SPEC.md section 20.2): the weekly
 * composer (opened by `?compose=1`), then the timeline of past updates with
 * a health trend sparkline. Edit and delete are offered to the author and
 * admins; "Copy for client" to everyone.
 */
export async function StatusUpdatesTab({ project, viewer, isAdmin, today, searchParams }: ProjectTabProps) {
  const [updates, draft, settings] = await Promise.all([
    listStatusUpdates(project.id),
    getStatusUpdateDraft(project.id, today),
    getAppSettings(),
  ]);
  const timeZone = safeTimeZone(settings.workspace_timezone);
  const cadenceDays = settings.update_cadence_days;
  const updateDue = isUpdateDue(project, today, cadenceDays, timeZone);
  const autoOpen = firstParam(searchParams.compose) === "1";
  const trend = [...updates].reverse().map((update) => ({ health: update.health, week_of: update.week_of }));
  const projectRef = { id: project.id, name: project.name, client: project.client };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <UpdateComposer
        projectId={project.id}
        draft={draft}
        autoOpen={autoOpen}
        updateDue={updateDue}
        cadenceDays={cadenceDays}
      />

      <section aria-labelledby="updates-timeline-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="updates-timeline-heading" className="text-base font-semibold text-fg">
              Updates
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
              {updates.length > 0 ? (
                <>
                  <span className="tabular-nums">
                    {pluralize(updates.length, "update")}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1.5">
                    Now <RagDot health={project.health} showLabel />
                  </span>
                </>
              ) : (
                "Nothing posted yet."
              )}
            </p>
          </div>
          {trend.length > 1 ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-card">
              <span className="text-xs text-fg-muted">Trend</span>
              <HealthSparkline points={trend} />
            </div>
          ) : null}
        </div>

        {updates.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="No status updates yet."
            description="Post the first weekly update. Its health shows on cards, the board, the timeline and Home."
          />
        ) : (
          <Stagger as="ol" className="relative space-y-4">
            {updates.map((update, index) => (
              <StaggerItem key={update.id} as="li">
                <UpdateCard
                  update={update}
                  project={projectRef}
                  canEdit={isAdmin || update.author_id === viewer.id}
                  isLatest={index === 0}
                />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>
    </div>
  );
}
