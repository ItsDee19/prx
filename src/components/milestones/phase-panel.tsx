"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as m from "motion/react-m";
import { toast } from "sonner";
import { ArrowRight, Gavel, MoreHorizontal, RotateCcw, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Money } from "@/components/ui/money";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { getMilestonePanelAction, requestGateReviewAction, setMilestoneStatusAction } from "@/actions/milestones";
import { MILESTONE_KIND_CONFIG, MOTION } from "@/lib/constants";
import type { Activity, Currency, MilestoneStatus, MilestoneWithMeta, TaskWithMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DeliverablesChecklist } from "./deliverables-checklist";
import { GateActionSlot } from "./gate-action-slot";
import { GateFields } from "./gate-fields";
import { InvoiceStatusBadge, MilestoneStatusBadge } from "./milestone-status-badge";
import { isMilestoneOverdue, phaseDateRangeLong } from "./milestone-utils";

export interface PhasePanelProps {
  milestoneId: string;
  projectId: string;
  isAdmin: boolean;
  /** Members can start, complete and reopen phases and request gate reviews. */
  canEdit: boolean;
  /** Admin or project owner: shows the gate decision action while the phase is in gate review. */
  canDecideGate: boolean;
  /** The project's currency (phase prices are in it). */
  currency?: Currency | null;
  /** Workspace today (overdue state). */
  today?: string;
  /** Changes whenever the phase changed elsewhere: reloads in place, keeping the current content. */
  reloadKey?: string;
  /** Tasks tab of this project (e.g. "/projects/x?tab=tasks"); adds a "View tasks" link filtered to the phase. */
  tasksHref?: string | null;
  className?: string;
}

interface PanelData {
  milestone: MilestoneWithMeta;
  deliverables: TaskWithMeta[];
  gate_history: Activity[];
}

/** Loaders appear after this delay and, once shown, stay at least SKELETON_MIN_MS. */
const SKELETON_DELAY_MS = 150;
const SKELETON_MIN_MS = 300;

type PhaseCommand =
  | { kind: "status"; status: MilestoneStatus; label: string; success: string }
  | { kind: "gate"; label: string; success: string };

function primaryCommand(milestone: MilestoneWithMeta): PhaseCommand | null {
  const point = milestone.kind === "milestone";
  switch (milestone.status) {
    case "planned":
      return point
        ? { kind: "status", status: "done", label: "Mark reached", success: "Milestone reached." }
        : { kind: "status", status: "active", label: "Start phase", success: "Phase started." };
    case "active":
      if (point) return { kind: "status", status: "done", label: "Mark reached", success: "Milestone reached." };
      return milestone.requires_gate
        ? { kind: "gate", label: "Request gate review", success: "Gate review requested." }
        : { kind: "status", status: "done", label: "Mark done", success: "Phase marked done." };
    default:
      return null;
  }
}

function secondaryCommands(milestone: MilestoneWithMeta, canDecideGate: boolean): PhaseCommand[] {
  switch (milestone.status) {
    case "active":
      return [{ kind: "status", status: "planned", label: "Move back to planned", success: "Moved back to planned." }];
    case "gate_review":
      return [{ kind: "status", status: "active", label: "Withdraw gate review", success: "Gate review withdrawn." }];
    case "stopped":
      // Reopening a phase stopped at its gate overrides that decision: admin or project owner only
      // (setMilestoneStatusAction enforces the same rule).
      if (milestone.gate_decision === "stop" && !canDecideGate) return [];
      return [{ kind: "status", status: "active", label: "Reopen", success: "Reopened." }];
    case "done":
      return [{ kind: "status", status: "active", label: "Reopen", success: "Reopened." }];
    default:
      return [];
  }
}

function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 rounded-xl bg-surface-2/60 px-3 py-2.5 ring-1 ring-inset ring-border/60", className)}>
      <p className="text-xs font-medium text-fg-muted">{label}</p>
      <div className="mt-1 min-w-0 text-sm text-fg">{children}</div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-5 w-48 max-w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="hidden h-16 sm:block" />
      </div>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10" />
      <Skeleton className="h-10" />
    </div>
  );
}

/**
 * Detail of one phase or milestone under the stepper: status and dates,
 * progress, deliverables checklist, the gate box with its decision history,
 * and (admins only) the fixed price and invoice status. Loads its data with
 * getMilestonePanelAction and reloads after its own changes.
 */
export function PhasePanel({
  milestoneId,
  projectId,
  isAdmin,
  canEdit,
  canDecideGate,
  currency = null,
  today,
  reloadKey,
  tasksHref = null,
  className,
}: PhasePanelProps) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<{ id: string; data: PanelData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const skeletonShownAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const delay = window.setTimeout(() => {
      if (cancelled) return;
      skeletonShownAt.current = Date.now();
      setShowSkeleton(true);
    }, SKELETON_DELAY_MS);
    let hide: number | undefined;

    const settle = (apply: () => void) => {
      window.clearTimeout(delay);
      if (cancelled) return;
      const shownAt = skeletonShownAt.current;
      const wait = shownAt === null ? 0 : Math.max(0, SKELETON_MIN_MS - (Date.now() - shownAt));
      hide = window.setTimeout(() => {
        if (cancelled) return;
        skeletonShownAt.current = null;
        setShowSkeleton(false);
        apply();
      }, wait);
    };

    getMilestonePanelAction(milestoneId)
      .then((result) => {
        settle(() => {
          if (result.ok) setLoaded({ id: milestoneId, data: result.data });
          else setError(result.error);
        });
      })
      .catch(() => {
        settle(() => setError("Could not load the phase. Please try again."));
      });

    return () => {
      cancelled = true;
      window.clearTimeout(delay);
      if (hide !== undefined) window.clearTimeout(hide);
    };
  }, [milestoneId, reloadKey, version]);

  const data = loaded && loaded.id === milestoneId ? loaded.data : null;

  async function run(command: PhaseCommand, milestone: MilestoneWithMeta) {
    setBusy(true);
    try {
      const result =
        command.kind === "gate"
          ? await requestGateReviewAction(milestone.id)
          : await setMilestoneStatusAction(milestone.id, command.status);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(command.success);
      setVersion((value) => value + 1);
      router.refresh();
    } catch {
      toast.error("Could not update the phase. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    if (error) {
      return (
        <div
          role="alert"
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-4 text-sm",
            className,
          )}
        >
          <span className="text-fg-muted">{error}</span>
          <Button variant="outline" size="sm" onClick={() => setVersion((value) => value + 1)}>
            <RotateCcw aria-hidden />
            Retry
          </Button>
        </div>
      );
    }
    return (
      <div className={cn("min-h-40", className)} aria-busy="true">
        {showSkeleton ? <PanelSkeleton /> : null}
        <span className="sr-only">Loading phase</span>
      </div>
    );
  }

  const { milestone, deliverables, gate_history: history } = data;
  const point = milestone.kind === "milestone";
  const overdue = isMilestoneOverdue(milestone, today);
  const primary = canEdit ? primaryCommand(milestone) : null;
  const secondary = canEdit ? secondaryCommands(milestone, canDecideGate) : [];
  const showGate = milestone.requires_gate || history.length > 0 || milestone.gate_decision !== null;
  const tasksLink = tasksHref ? `${tasksHref}&milestone=${encodeURIComponent(milestone.id)}` : null;

  return (
    <m.section
      key={milestone.id}
      aria-labelledby={`phase-panel-${milestone.id}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION.duration.popover, ease: MOTION.ease.outExpo }}
      className={cn("space-y-5", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Icon
              name={MILESTONE_KIND_CONFIG[milestone.kind].icon}
              className="size-4 text-fg-subtle"
              label={MILESTONE_KIND_CONFIG[milestone.kind].label}
            />
            <h4
              id={`phase-panel-${milestone.id}`}
              className="min-w-0 text-base font-semibold leading-6 tracking-tight text-fg [overflow-wrap:anywhere]"
            >
              {milestone.name}
            </h4>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <MilestoneStatusBadge status={milestone.status} />
            {milestone.requires_gate ? (
              <Badge tone="amber" className="gap-1">
                <Gavel className="size-3" aria-hidden />
                Gate
              </Badge>
            ) : null}
            <span className={cn("text-xs tabular-nums", overdue ? "font-medium text-danger" : "text-fg-muted")}>
              {phaseDateRangeLong(milestone)}
              {overdue ? " · overdue" : null}
            </span>
          </div>
        </div>

        {primary || secondary.length > 0 || (canDecideGate && milestone.status === "gate_review") ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {canDecideGate && milestone.status === "gate_review" ? (
              <GateActionSlot milestone={milestone} projectId={projectId} />
            ) : null}
            {primary ? (
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                className="flex-1 sm:flex-none"
                onClick={() => void run(primary, milestone)}
              >
                {primary.kind === "gate" ? <Gavel aria-hidden /> : null}
                {primary.label}
              </Button>
            ) : null}
            {secondary.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    disabled={busy}
                    aria-label={`More actions for ${milestone.name}`}
                  >
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {secondary.map((command) => (
                    <DropdownMenuItem key={command.label} onSelect={() => void run(command, milestone)}>
                      {command.label === "Reopen" ? <RotateCcw aria-hidden /> : <Undo2 aria-hidden />}
                      {command.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={cn("grid grid-cols-1 gap-3", isAdmin && !point ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        <Stat label="Tasks">
          <span className="flex items-center gap-2.5">
            <ProgressRing
              value={milestone.progress}
              size={32}
              tone={milestone.status === "done" ? "success" : milestone.status === "gate_review" ? "warning" : "accent"}
              label={`${milestone.name} progress`}
            />
            <span className="min-w-0">
              <span className="block font-semibold tabular-nums">{milestone.progress}%</span>
              <span className="block text-xs tabular-nums text-fg-muted">
                {milestone.task_count > 0
                  ? `${milestone.task_done_count} of ${milestone.task_count} done`
                  : "No tasks yet"}
              </span>
            </span>
          </span>
          {tasksLink ? (
            <Link
              href={tasksLink}
              className="mt-2 inline-flex items-center gap-1 rounded text-xs font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              View tasks
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </Stat>
        <Stat label="Deliverables">
          <span className="block font-semibold tabular-nums">
            {milestone.deliverable_done_count}/{milestone.deliverable_count}
          </span>
          <span className="block text-xs text-fg-muted">
            {milestone.deliverable_count === 0
              ? "None flagged"
              : milestone.deliverable_done_count === milestone.deliverable_count
                ? "All delivered"
                : `${milestone.deliverable_count - milestone.deliverable_done_count} to go`}
          </span>
        </Stat>
        {isAdmin && !point ? (
          <Stat label="Price">
            {currency ? (
              <Money amount={milestone.price} currency={currency} className="block font-semibold" />
            ) : (
              <span className="block text-fg-muted">No currency set</span>
            )}
            {milestone.invoice_status ? (
              <InvoiceStatusBadge status={milestone.invoice_status} className="mt-1.5" />
            ) : null}
          </Stat>
        ) : null}
      </div>

      {milestone.description.trim() ? (
        <p className="max-w-[80ch] whitespace-pre-wrap text-sm leading-6 text-fg [overflow-wrap:anywhere]">
          {milestone.description}
        </p>
      ) : null}

      <section aria-labelledby={`phase-deliverables-${milestone.id}`} className="space-y-3">
        <h5
          id={`phase-deliverables-${milestone.id}`}
          className="text-xs font-semibold uppercase tracking-wide text-fg-muted"
        >
          Deliverables
        </h5>
        <DeliverablesChecklist
          deliverables={deliverables}
          readOnly={!canEdit}
          onChanged={() => setVersion((value) => value + 1)}
        />
      </section>

      {showGate ? (
        <section aria-labelledby={`phase-gate-${milestone.id}`} className="space-y-3 border-t border-border pt-5">
          <h5 id={`phase-gate-${milestone.id}`} className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Gate
          </h5>
          <GateFields milestone={milestone} history={history} />
        </section>
      ) : null}
    </m.section>
  );
}
