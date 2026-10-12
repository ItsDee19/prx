"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, MoreHorizontal, Pencil, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { closeRiskAction, convertRiskToIssueAction, deleteRiskAction, updateRiskAction } from "@/actions/risks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RISK_KIND_CONFIG } from "@/lib/constants";
import type { Risk, UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RiskDialog } from "./risk-dialog";

export interface RiskRowActionsProps {
  risk: Risk;
  users: UserSummary[];
  /** Creator, project owner or admin. */
  canDelete: boolean;
  className?: string;
}

/** Row menu: Edit, Convert to issue, Close / Reopen, Delete (with confirm). */
export function RiskRowActions({ risk, users, canDelete, className }: RiskRowActionsProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const noun = RISK_KIND_CONFIG[risk.kind].label.toLowerCase();
  const closed = risk.status === "closed";
  const canConvert = risk.kind !== "issue" && risk.kind !== "decision";

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      after?.();
      toast.success(success);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8 shrink-0", className)}
            aria-label={`Actions for ${risk.title}`}
            disabled={pending}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          {canConvert ? (
            <DropdownMenuItem
              onSelect={() => run(() => convertRiskToIssueAction(risk.id), "Converted to an issue.")}
            >
              <TriangleAlert aria-hidden />
              Convert to issue
            </DropdownMenuItem>
          ) : null}
          {closed ? (
            <DropdownMenuItem
              onSelect={() => run(() => updateRiskAction(risk.id, { status: "open" }), "Reopened.")}
            >
              <RotateCcw aria-hidden />
              Reopen
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => run(() => closeRiskAction(risk.id), "Closed.")}>
              <CircleCheck aria-hidden />
              Close
            </DropdownMenuItem>
          )}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                <Trash2 aria-hidden />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <RiskDialog
        mode="edit"
        projectId={risk.project_id}
        risk={risk}
        users={users}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <Dialog open={confirmOpen} onOpenChange={(next) => (pending ? undefined : setConfirmOpen(next))}>
        <DialogContent
          size="sm"
          title={`Delete this ${noun}?`}
          description={`"${risk.title}" will be removed from the RAID log. Close it instead to keep the record.`}
        >
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => run(() => deleteRiskAction(risk.id), "Deleted.", () => setConfirmOpen(false))}
            >
              Delete {noun}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
