"use client";

import { Gavel } from "lucide-react";
import { GateDialog } from "@/components/scorecard/gate-dialog";
import { Button } from "@/components/ui/button";
import type { MilestoneWithMeta } from "@/lib/types";

export interface GateActionSlotProps {
  milestone: MilestoneWithMeta;
  projectId: string;
}

/**
 * Where the go / extend / stop decision plugs into the phase stepper and the
 * phase panel (SPEC.md section 21.2). Callers render it only for people who
 * may decide (admin or project owner); it opens the gate dialog for phases in
 * gate review and renders nothing otherwise.
 */
export function GateActionSlot({ milestone }: GateActionSlotProps) {
  if (milestone.status !== "gate_review") return null;
  return (
    <GateDialog
      milestoneId={milestone.id}
      trigger={
        <Button size="sm">
          <Gavel aria-hidden />
          Decide gate
        </Button>
      }
    />
  );
}
