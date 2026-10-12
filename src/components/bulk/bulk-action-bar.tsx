"use client";

import { forwardRef, useEffect, useRef, useState, useTransition, type ButtonHTMLAttributes, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CircleDot,
  Flag,
  Layers,
  Minus,
  Tag,
  Trash,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { bulkDeleteTasksAction, bulkUpdateProjectsAction, bulkUpdateTasksAction } from "@/actions/bulk";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Spinner } from "@/components/ui/spinner";
import { UserPicker } from "@/components/ui/user-picker";
import {
  MAX_BULK_IDS,
  MILESTONE_KIND_CONFIG,
  MOTION,
  PRIORITY_CONFIG,
  PRIORITY_ORDER,
  STATUS_CONFIG,
  STATUS_ORDER,
  TASK_STATUS_CONFIG,
  TASK_STATUS_ORDER,
} from "@/lib/constants";
import type {
  ActionResult,
  BulkProjectPatch,
  BulkResult,
  BulkTaskPatch,
  LabelSummary,
  MilestoneRef,
  Priority,
  UserSummary,
} from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { BulkDueDatePopover, BulkLabelsPopover } from "./bulk-popovers";

export interface BulkActionBarProps {
  kind: "tasks" | "projects";
  /** From `useSelection().selectedIds`; the bar shows while it is non-empty. */
  selectedIds: string[];
  /** Clears the selection (the clear button, Esc, and after a bulk delete). */
  onClear: () => void;
  /** Active people for the Assignee / Owner picker. */
  users: UserSummary[];
  labels: LabelSummary[];
  /** Phases of the one project the tasks belong to; the Phase action shows only when given. */
  milestones?: MilestoneRef[];
  /** Called after a successful bulk action (the page is refreshed either way). */
  onDone?: (result: BulkResult, action: "update" | "delete") => void;
  className?: string;
}

const PRIORITY_ICONS: Record<Priority, LucideIcon> = {
  low: ArrowDown,
  medium: Minus,
  high: ArrowUp,
  urgent: AlertTriangle,
};

/** Popover/menu/dialog layers that own Escape while they are open. */
const OPEN_LAYER_SELECTOR = "[role='dialog'], [role='menu'], [role='listbox'], [data-radix-popper-content-wrapper]";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Floating glass bar for bulk edits, bottom centre (slides up 12px and fades
 * in over 200ms). Shows the count and the actions as dropdowns: tasks get
 * Status, Assignee, Priority, Labels, Phase (when `milestones` is given),
 * Due date and Delete (with confirm); projects get Status, Owner, Priority
 * and Labels. Esc clears the selection; the bar is a keyboard toolbar (Tab
 * into it, arrow keys between actions).
 */
export function BulkActionBar({
  kind,
  selectedIds,
  onClear,
  users,
  labels,
  milestones,
  onDone,
  className,
}: BulkActionBarProps) {
  const router = useRouter();
  const reduce = useReducedMotionConfig() === true;
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const count = selectedIds.length;
  const noun = kind === "tasks" ? "task" : "project";
  const overLimit = count > MAX_BULK_IDS;
  const disabled = pending || overLimit;

  // Esc clears the selection unless a menu, popover or dialog is handling it.
  useEffect(() => {
    if (count === 0) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || isTypingTarget(event.target)) return;
      if (document.querySelector(OPEN_LAYER_SELECTOR)) return;
      onClear();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [count, onClear]);

  function summarise(result: BulkResult, verb: string): string {
    const done = `${verb} ${pluralize(result.updated, noun)}.`;
    if (result.updated === 0) return `Nothing changed. The selected ${noun}s already match.`;
    const unchanged = count - result.updated;
    return unchanged > 0 ? `${done} ${unchanged} already matched.` : done;
  }

  function run(action: () => Promise<ActionResult<BulkResult>>, kindOfAction: "update" | "delete") {
    if (disabled) return;
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (kindOfAction === "delete") {
        setDeleteOpen(false);
        toast.success(`Deleted ${pluralize(result.data.updated, noun)}.`);
        onClear();
      } else {
        toast.success(summarise(result.data, "Updated"));
      }
      onDone?.(result.data, kindOfAction);
      router.refresh();
    });
  }

  const updateTasks = (patch: BulkTaskPatch) => run(() => bulkUpdateTasksAction(selectedIds, patch), "update");
  const updateProjects = (patch: BulkProjectPatch) => run(() => bulkUpdateProjectsAction(selectedIds, patch), "update");

  /** Toolbar pattern: Left/Right/Home/End move between the actions. */
  function onToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    if (isTypingTarget(event.target)) return;
    const buttons = Array.from(
      toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button[data-bulk-action]:not(:disabled)") ?? [],
    );
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0 || buttons.length === 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  const enterTransition = reduce
    ? { duration: MOTION.duration.press }
    : { duration: MOTION.duration.popover, ease: MOTION.ease.outExpo };
  const exitTransition = reduce
    ? { duration: MOTION.duration.press }
    : { duration: MOTION.duration.popover * MOTION.exitFactor, ease: MOTION.ease.inExit };

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {count > 0 ? `${pluralize(count, noun)} selected. Bulk actions are at the bottom of the page; Esc clears the selection.` : ""}
      </p>
      <AnimatePresence>
        {count > 0 ? (
          <m.div
            key="bulk-bar"
            className={cn(
              "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4",
              "pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
              className,
            )}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: enterTransition }}
            exit={reduce ? { opacity: 0, transition: exitTransition } : { opacity: 0, y: 12, transition: exitTransition }}
          >
            <div
              ref={toolbarRef}
              role="toolbar"
              aria-label={`Bulk actions for ${pluralize(count, noun)}`}
              aria-orientation="horizontal"
              onKeyDown={onToolbarKeyDown}
              className="pointer-events-auto flex min-w-0 max-w-full items-center gap-1 rounded-full border border-glass-border glass-panel p-1.5 text-fg shadow-pop"
            >
              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap pl-2.5 pr-1 text-sm font-medium tabular-nums">
                <NumberTicker value={count} />
                <span className="text-fg-muted">selected</span>
              </span>
              <span aria-hidden className="h-5 w-px shrink-0 bg-border" />

              {overLimit ? (
                <p className="whitespace-nowrap px-2 text-xs font-medium text-warning">
                  Select up to {MAX_BULK_IDS} at a time.
                </p>
              ) : (
                <div className="scrollbar-none flex min-w-0 items-center gap-0.5 overflow-x-auto">
                  {kind === "tasks" ? (
                    <TaskActions
                      disabled={disabled}
                      users={users}
                      labels={labels}
                      milestones={milestones}
                      onUpdate={updateTasks}
                      onDelete={() => setDeleteOpen(true)}
                    />
                  ) : (
                    <ProjectActions disabled={disabled} users={users} labels={labels} onUpdate={updateProjects} />
                  )}
                </div>
              )}

              <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
              {pending ? <Spinner size="sm" label="Applying changes" className="mx-1 shrink-0" /> : null}
              <Button
                variant="ghost"
                size="icon"
                data-bulk-action=""
                aria-label="Clear selection (Esc)"
                title="Clear selection (Esc)"
                onClick={onClear}
                className="size-8 shrink-0"
              >
                <X aria-hidden />
              </Button>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>

      {kind === "tasks" ? (
        <Dialog open={deleteOpen} onOpenChange={(next) => (pending ? undefined : setDeleteOpen(next))}>
          <DialogContent
            size="sm"
            title={`Delete ${pluralize(count, "task")}?`}
            description="Their subtasks, checklists, comments and files are deleted too. This can't be undone."
          >
            <DialogFooter className="mt-2">
              <DialogClose asChild>
                <Button variant="outline" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button variant="danger" loading={pending} onClick={() => run(() => bulkDeleteTasksAction(selectedIds), "delete")}>
                Delete {pluralize(count, "task")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

/* ------------------------------- Actions -------------------------------- */

interface BarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  destructive?: boolean;
}

/** Icon + label (label visually hidden on phones, still the accessible name). */
const BarButton = forwardRef<HTMLButtonElement, BarButtonProps>(function BarButton(
  { icon: Glyph, label, destructive = false, className, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      data-bulk-action=""
      className={cn(
        "h-8 shrink-0 px-2.5 data-[state=open]:bg-surface-2 data-[state=open]:text-fg max-sm:w-9 max-sm:px-0",
        destructive && "text-danger hover:bg-danger/10 hover:text-danger",
        className,
      )}
      {...props}
    >
      <Glyph aria-hidden />
      <span className="max-sm:sr-only">{label}</span>
    </Button>
  );
});

interface TaskActionsProps {
  disabled: boolean;
  users: UserSummary[];
  labels: LabelSummary[];
  milestones?: MilestoneRef[];
  onUpdate: (patch: BulkTaskPatch) => void;
  onDelete: () => void;
}

function TaskActions({ disabled, users, labels, milestones, onUpdate, onDelete }: TaskActionsProps) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <BarButton icon={CircleDot} label="Status" disabled={disabled} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center">
          <DropdownMenuLabel>Set status</DropdownMenuLabel>
          {TASK_STATUS_ORDER.map((status) => (
            <DropdownMenuItem key={status} onSelect={() => onUpdate({ status })}>
              <Icon name={TASK_STATUS_CONFIG[status].icon} aria-hidden />
              {TASK_STATUS_CONFIG[status].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <UserPicker
        users={users}
        value={null}
        allowUnassigned
        align="center"
        aria-label="Assign to"
        disabled={disabled}
        onChange={(id) => onUpdate({ assignee_id: id })}
        trigger={<BarButton icon={UserRound} label="Assignee" disabled={disabled} />}
      />

      <PriorityMenu disabled={disabled} onPick={(priority) => onUpdate({ priority })} />

      <BulkLabelsPopover
        labels={labels}
        onApply={onUpdate}
        trigger={<BarButton icon={Tag} label="Labels" disabled={disabled} />}
      />

      {milestones ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BarButton icon={Layers} label="Phase" disabled={disabled} />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center">
            <DropdownMenuLabel>Move to phase</DropdownMenuLabel>
            {milestones.map((milestone) => (
              <DropdownMenuItem key={milestone.id} onSelect={() => onUpdate({ milestone_id: milestone.id })}>
                <Icon name={MILESTONE_KIND_CONFIG[milestone.kind].icon} aria-hidden />
                <span className="truncate">{milestone.name}</span>
              </DropdownMenuItem>
            ))}
            {milestones.length > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={() => onUpdate({ milestone_id: null })}>
              <Minus aria-hidden />
              No phase
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <BulkDueDatePopover
        onApply={(date) => onUpdate({ due_date: date })}
        trigger={<BarButton icon={CalendarDays} label="Due date" disabled={disabled} />}
      />

      <BarButton icon={Trash} label="Delete" destructive disabled={disabled} onClick={onDelete} />
    </>
  );
}

interface ProjectActionsProps {
  disabled: boolean;
  users: UserSummary[];
  labels: LabelSummary[];
  onUpdate: (patch: BulkProjectPatch) => void;
}

function ProjectActions({ disabled, users, labels, onUpdate }: ProjectActionsProps) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <BarButton icon={CircleDot} label="Status" disabled={disabled} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center">
          <DropdownMenuLabel>Set status</DropdownMenuLabel>
          {STATUS_ORDER.map((status) => (
            <DropdownMenuItem key={status} onSelect={() => onUpdate({ status })}>
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_CONFIG[status].dotClass)} />
              {STATUS_CONFIG[status].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <UserPicker
        users={users}
        value={null}
        allowUnassigned
        align="center"
        aria-label="Set owner"
        disabled={disabled}
        onChange={(id) => onUpdate({ owner_id: id })}
        trigger={<BarButton icon={UserRound} label="Owner" disabled={disabled} />}
      />

      <PriorityMenu disabled={disabled} onPick={(priority) => onUpdate({ priority })} />

      <BulkLabelsPopover
        labels={labels}
        onApply={onUpdate}
        trigger={<BarButton icon={Tag} label="Labels" disabled={disabled} />}
      />
    </>
  );
}

function PriorityMenu({ disabled, onPick }: { disabled: boolean; onPick: (priority: Priority) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <BarButton icon={Flag} label="Priority" disabled={disabled} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center">
        <DropdownMenuLabel>Set priority</DropdownMenuLabel>
        {PRIORITY_ORDER.map((priority) => {
          const Glyph = PRIORITY_ICONS[priority];
          return (
            <DropdownMenuItem key={priority} onSelect={() => onPick(priority)}>
              <Glyph aria-hidden className={PRIORITY_CONFIG[priority].iconClass} />
              {PRIORITY_CONFIG[priority].label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
