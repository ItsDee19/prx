"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Gavel, GripVertical, Layers, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Money } from "@/components/ui/money";
import { deleteMilestoneAction, reorderMilestonesAction } from "@/actions/milestones";
import { MILESTONE_KIND_CONFIG } from "@/lib/constants";
import type { Currency, MilestoneWithMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MilestoneForm } from "./milestone-form";
import { InvoiceStatusBadge, MilestoneStatusBadge } from "./milestone-status-badge";
import { phaseDateRangeLong } from "./milestone-utils";

export interface MilestoneManagerDialogProps {
  projectId: string;
  milestones: MilestoneWithMeta[];
  isAdmin: boolean;
  /**
   * Element that opens the dialog (rendered via `asChild`). Focus returns to it
   * when the dialog closes, so controlled callers should still pass one.
   */
  trigger?: ReactNode;
  /** Controlled open state (with `onOpenChange`); uncontrolled when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The project's currency: phase prices need one (admins only). */
  currency?: Currency | null;
  /** Admin or project owner (delete is refused server-side for anyone else). */
  canDelete?: boolean;
  /** Admin or project owner: may remove or change a phase's gate (see MilestoneForm). Defaults to `isAdmin`. */
  canChangeGate?: boolean;
}

interface RowProps {
  milestone: MilestoneWithMeta;
  index: number;
  count: number;
  projectId: string;
  isAdmin: boolean;
  currency: Currency | null;
  canDelete: boolean;
  canChangeGate: boolean;
  editing: boolean;
  onEdit: (id: string | null) => void;
  onMove: (id: string, offset: -1 | 1) => void;
  busy: boolean;
}

function SortableMilestoneRow({
  milestone,
  index,
  count,
  projectId,
  isAdmin,
  currency,
  canDelete,
  canChangeGate,
  editing,
  onEdit,
  onMove,
  busy,
}: RowProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: milestone.id,
    disabled: editing || busy,
  });
  const kind = MILESTONE_KIND_CONFIG[milestone.kind];
  const isPhase = milestone.kind === "phase";

  async function remove() {
    setDeleting(true);
    try {
      const result = await deleteMilestoneAction(milestone.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted "${milestone.name}"`);
      setConfirming(false);
      router.refresh();
    } catch {
      toast.error("Could not delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      {/*
        The first-mount stagger and the lift live on inner wrappers; the sortable node only ever gets
        dnd-kit's translate. StaggerItem drops its reveal once the list has settled, so rows moved by a
        reorder (React re-inserts the keyed <li>s) never replay the entrance.
      */}
      <StaggerItem>
        <div
          className={cn(
            "rounded-xl border bg-surface transition-[box-shadow,border-color,scale] duration-(--dur-3) ease-out-quart",
            isDragging ? "scale-[1.01] border-border-strong shadow-pop" : "border-border",
            editing && "border-accent/50",
          )}
        >
          <div className="flex items-center gap-1.5 py-2 pl-1 pr-2 sm:gap-2">
            <button
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${milestone.name}`}
              className={cn(
                "relative flex size-8 shrink-0 touch-none items-center justify-center rounded-lg text-fg-subtle outline-none",
                "cursor-grab transition-colors duration-(--dur-2) hover:bg-surface-2 hover:text-fg active:cursor-grabbing",
                "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                "pointer-coarse:after:absolute pointer-coarse:after:-inset-1",
              )}
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
            <Icon name={kind.icon} className="size-4 text-fg-subtle" label={kind.label} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg" title={milestone.name}>
                {milestone.name}
              </p>
              <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
                <span className="tabular-nums">{phaseDateRangeLong(milestone)}</span>
                {milestone.requires_gate ? (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <Gavel className="size-3" aria-hidden />
                    Gate
                  </span>
                ) : null}
                {isAdmin && isPhase && currency && milestone.price !== null ? (
                  <Money amount={milestone.price} currency={currency} compact className="text-fg" />
                ) : null}
                {isAdmin && isPhase && milestone.invoice_status && milestone.price !== null ? (
                  <InvoiceStatusBadge status={milestone.invoice_status} />
                ) : null}
              </p>
            </div>
            <MilestoneStatusBadge status={milestone.status} className="hidden sm:inline-flex" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={busy || deleting}
                  aria-label={`Actions for ${milestone.name}`}
                >
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setConfirming(false);
                    onEdit(editing ? null : milestone.id);
                  }}
                >
                  <Pencil aria-hidden />
                  {editing ? "Close editor" : "Edit"}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(milestone.id, -1)}>
                  <ArrowUp aria-hidden />
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(milestone.id, 1)}>
                  <ArrowDown aria-hidden />
                  Move down
                </DropdownMenuItem>
                {canDelete ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      destructive
                      onSelect={() => {
                        onEdit(null);
                        setConfirming(true);
                      }}
                    >
                      <Trash2 aria-hidden />
                      Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {confirming ? (
            <div
              role="alertdialog"
              aria-label={`Delete ${milestone.name}?`}
              className="flex flex-col gap-3 border-t border-border bg-danger/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-fg [overflow-wrap:anywhere]">
                Delete &ldquo;{milestone.name}&rdquo;? Its tasks stay in the project without a phase.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
                <Button variant="danger" size="sm" className="flex-1 sm:flex-none" loading={deleting} onClick={remove}>
                  Delete
                </Button>
              </div>
            </div>
          ) : null}

          {editing ? (
            <div className="border-t border-border px-3 pb-3 pt-4">
              <MilestoneForm
                mode="edit"
                projectId={projectId}
                milestone={milestone}
                isAdmin={isAdmin}
                currency={currency}
                canChangeGate={canChangeGate}
                autoFocus
                onDone={() => onEdit(null)}
                onCancel={() => onEdit(null)}
              />
            </div>
          ) : null}
        </div>
      </StaggerItem>
    </li>
  );
}

/**
 * Add, edit, reorder and delete a project's phases and point milestones.
 * Rows reorder by dragging the grip (pointer or keyboard: Space, arrows,
 * Space) or with the Move up / Move down menu items; every reorder is saved
 * with reorderMilestonesAction.
 */
export function MilestoneManagerDialog({
  projectId,
  milestones,
  isAdmin,
  trigger,
  open: openProp,
  onOpenChange,
  currency = null,
  canDelete = isAdmin,
  canChangeGate = isAdmin,
}: MilestoneManagerDialogProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);

  function setOpen(next: boolean) {
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  // Reset on every open/close, whoever toggled it (the trigger, the parent or Escape): an empty
  // list opens straight into the add form, and closing drops any open editor.
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    setEditingId(null);
    setDragging(false);
    setAdding(open && milestones.length === 0);
  }

  // Escape during a drag must cancel the drag, not close the dialog. Radix's dialog listens for
  // Escape on document in the capture phase, before dnd-kit's sensors (document, bubble phase).
  // Marking the event handled from window, capture phase (earlier still), makes Radix skip the
  // dismiss; dnd-kit ignores defaultPrevented and still cancels the drag.
  // (A list emptied mid-drag unmounts the DndContext without a cancel event, hence the length check.)
  const dragActive = dragging && milestones.length > 0;
  useEffect(() => {
    if (!dragActive) return;
    const keepDialogOpen = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    window.addEventListener("keydown", keepDialogOpen, true);
    return () => window.removeEventListener("keydown", keepDialogOpen, true);
  }, [dragActive]);

  // Local order for optimistic reordering; re-synced whenever the server list changes.
  const propOrder = milestones.map((milestone) => milestone.id);
  const signature = propOrder.join("|");
  const [order, setOrder] = useState<string[]>(propOrder);
  const [seenSignature, setSeenSignature] = useState(signature);
  if (signature !== seenSignature) {
    setSeenSignature(signature);
    setOrder(propOrder);
  }

  const byId = new Map(milestones.map((milestone) => [milestone.id, milestone]));
  const rows = order.map((id) => byId.get(id)).filter((row): row is MilestoneWithMeta => row !== undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nameOf = (id: UniqueIdentifier) => byId.get(String(id))?.name ?? "the phase";
  const positionOf = (id: UniqueIdentifier) => rows.findIndex((row) => row.id === String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)}, position ${positionOf(active.id)} of ${rows.length}. Use the arrow keys to move it.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} is now at position ${positionOf(over.id)} of ${rows.length}.`
        : `${nameOf(active.id)} is no longer over the list.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)} of ${rows.length}.`
        : `${nameOf(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  async function saveOrder(next: string[], previous: string[]) {
    setOrder(next);
    setSaving(true);
    try {
      const result = await reorderMilestonesAction(projectId, next);
      if (!result.ok) {
        toast.error(result.error);
        setOrder(previous);
        return;
      }
      router.refresh();
    } catch {
      toast.error("Could not reorder. Please try again.");
      setOrder(previous);
    } finally {
      setSaving(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    void saveOrder(arrayMove(order, from, to), order);
  }

  function move(id: string, offset: -1 | 1) {
    const from = order.indexOf(id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= order.length) return;
    void saveOrder(arrayMove(order, from, to), order);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        title="Manage phases"
        description="Delivery phases carry tasks, deliverables and gates. Point milestones mark a date such as go-live."
        size="lg"
      >
        <div className="space-y-4">
          {rows.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No phases yet"
              description="Add the first phase below, for example Audit, Pilot, Integrate or Scale."
              className="py-6"
            />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              accessibility={{
                announcements,
                screenReaderInstructions: {
                  draggable:
                    "To reorder, press Space or Enter on the grip, move with the arrow keys, then press Space or Enter to drop or Escape to cancel. The row menu also has Move up and Move down.",
                },
              }}
              onDragStart={() => setDragging(true)}
              onDragCancel={() => setDragging(false)}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                <div role="group" aria-label="Phases and milestones" aria-busy={saving || undefined}>
                  <Stagger as="ol" className="space-y-2">
                    {rows.map((milestone, index) => (
                      <SortableMilestoneRow
                        key={milestone.id}
                        milestone={milestone}
                        index={index}
                        count={rows.length}
                        projectId={projectId}
                        isAdmin={isAdmin}
                        currency={currency}
                        canDelete={canDelete}
                        canChangeGate={canChangeGate}
                        editing={editingId === milestone.id}
                        onEdit={setEditingId}
                        onMove={move}
                        busy={saving}
                      />
                    ))}
                  </Stagger>
                </div>
              </SortableContext>
            </DndContext>
          )}

          {adding ? (
            <section aria-label="Add a phase or milestone" className="rounded-xl border border-dashed border-border p-3 sm:p-4">
              <h4 className="mb-3 text-sm font-semibold text-fg">Add a phase or milestone</h4>
              <MilestoneForm
                mode="create"
                projectId={projectId}
                isAdmin={isAdmin}
                currency={currency}
                autoFocus
                onCancel={() => setAdding(false)}
              />
            </section>
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => {
                setEditingId(null);
                setAdding(true);
              }}
            >
              <Plus aria-hidden />
              Add phase or milestone
            </Button>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
