"use client";

import { useState } from "react";
import { Layers, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { Currency, MilestoneWithMeta } from "@/lib/types";
import { MilestoneManagerDialog } from "./milestone-manager-dialog";
import { defaultSelectedId, phaseTally } from "./milestone-utils";
import { PhasePanel } from "./phase-panel";
import { PhaseStepper } from "./phase-stepper";

export interface PhasesPanelProps {
  milestones: MilestoneWithMeta[];
  projectId: string;
  isAdmin: boolean;
  canEdit: boolean;
  canDecideGate: boolean;
  /** Workspace today (overdue phases). */
  today?: string;
  /** The project's currency (phase prices). */
  currency?: Currency | null;
  /** Admin or project owner. */
  canDelete?: boolean;
  /** The project's Tasks tab URL when that tab exists ("View tasks" per phase). */
  tasksHref?: string | null;
}

/**
 * The phases overview card body: the stepper, the selected phase's panel and
 * the "Manage" dialog. Owns which phase is selected (the current phase first)
 * and whether the dialog is open: the dialog is mounted once, outside the
 * empty / non-empty branches, so adding the first phase (or deleting the
 * last) never unmounts it while it is open.
 */
export function PhasesPanel({
  milestones,
  projectId,
  isAdmin,
  canEdit,
  canDecideGate,
  today,
  currency = null,
  canDelete = isAdmin,
  tasksHref = null,
}: PhasesPanelProps) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  // A chosen phase that was deleted (or never chosen) falls back to the current phase.
  const selectedId =
    chosenId && milestones.some((milestone) => milestone.id === chosenId) ? chosenId : defaultSelectedId(milestones);
  const selected = milestones.find((milestone) => milestone.id === selectedId) ?? null;
  const tally = phaseTally(milestones);

  // The header button is the dialog's trigger, so focus always has a control to return to on close
  // (the empty state's "Add phases" disappears once the first phase exists).
  const manageTrigger = (
    <Button variant="outline" size="sm" aria-label="Manage phases">
      <Settings2 aria-hidden />
      Manage
    </Button>
  );

  return (
    <Card>
      <CardHeader className="flex-wrap items-center gap-y-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <CardTitle id="project-phases-heading">Phases</CardTitle>
          {tally.total > 0 ? (
            <span className="text-xs tabular-nums text-fg-muted">
              {tally.done} of {tally.total} done
            </span>
          ) : null}
        </div>
        {canEdit ? (
          <MilestoneManagerDialog
            open={manageOpen}
            onOpenChange={setManageOpen}
            projectId={projectId}
            milestones={milestones}
            isAdmin={isAdmin}
            currency={currency}
            canDelete={canDelete}
            canChangeGate={canDecideGate}
            trigger={manageTrigger}
          />
        ) : null}
      </CardHeader>
      <CardContent>
        {milestones.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No phases yet"
            description="Plan the engagement as phases (Audit, Pilot, Integrate, Scale) with deliverables and go / no-go gates."
            action={
              canEdit ? (
                <Button size="sm" aria-haspopup="dialog" onClick={() => setManageOpen(true)}>
                  <Plus aria-hidden />
                  Add phases
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-5">
            <PhaseStepper
              milestones={milestones}
              projectId={projectId}
              selectedId={selectedId}
              onSelect={setChosenId}
              canDecideGate={canDecideGate}
              today={today}
            />
            {selected ? (
              <div className="border-t border-border pt-5">
                <PhasePanel
                  milestoneId={selected.id}
                  projectId={projectId}
                  isAdmin={isAdmin}
                  canEdit={canEdit}
                  canDecideGate={canDecideGate}
                  currency={currency}
                  today={today}
                  tasksHref={tasksHref}
                  reloadKey={[
                    selected.updated_at,
                    selected.task_count,
                    selected.task_done_count,
                    selected.deliverable_count,
                    selected.deliverable_done_count,
                  ].join(":")}
                />
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
