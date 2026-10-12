"use client";

import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { ChevronsLeftRight, ChevronsRightLeft } from "lucide-react";
import { toast } from "sonner";
import { moveTaskAction, updateTaskStatusAction } from "@/actions/tasks";
import { Stagger, StaggerItem } from "@/components/motion";
import { BOARD_COLUMN_CLASS, BOARD_TRACK_CLASS } from "@/components/projects/board-layout";
import { MOTION, TASK_BOARD_COLUMNS, TASK_STATUS_CONFIG } from "@/lib/constants";
import { TASK_STATUSES, type MilestoneRef, type TaskStatus, type TaskWithMeta, type UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TaskCard } from "./task-card";
import { useTaskHref } from "./task-link";
import { TaskQuickAdd } from "./task-quick-add";
import { TaskStatusIcon } from "./task-status";
import { useTaskListNavigation } from "./use-task-list-navigation";

export interface TaskBoardProps {
  tasks: TaskWithMeta[];
  /** Enables quick add at each column foot (tasks are created in this project). */
  projectId?: string;
  users: UserSummary[];
  milestones?: MilestoneRef[];
  /** Show the project on each card (cross-project boards such as My tasks). */
  showProject?: boolean;
  /** Workspace today. */
  today: string;
  /** Quick add puts new tasks in this phase (the board's milestone filter). */
  defaultMilestoneId?: string | null;
  /** Parent keys by parent task id (listParentTaskKeys): subtasks show "Subtask of PRX-n". */
  parentKeys?: Record<string, string>;
  /** The signed-in user: enables the "a" (assign to me) card shortcut. */
  viewerId?: string;
  className?: string;
}

type Columns = Record<TaskStatus, string[]>;

/** Column that renders collapsed until opened. */
const COLLAPSIBLE: TaskStatus = "cancelled";
const COLUMN_ATTRIBUTE = "data-task-column";

function isStatus(value: UniqueIdentifier | null | undefined): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

function emptyColumns(): Columns {
  return { todo: [], in_progress: [], in_review: [], done: [], cancelled: [] };
}

function buildColumns(tasks: TaskWithMeta[]): Columns {
  const columns = emptyColumns();
  for (const task of tasks) columns[task.status].push(task.id);
  return columns;
}

function cloneColumns(columns: Columns): Columns {
  return {
    todo: [...columns.todo],
    in_progress: [...columns.in_progress],
    in_review: [...columns.in_review],
    done: [...columns.done],
    cancelled: [...columns.cancelled],
  };
}

function containerOf(columns: Columns, id: UniqueIdentifier): TaskStatus | null {
  if (isStatus(id)) return id;
  for (const status of TASK_BOARD_COLUMNS) if (columns[status].includes(String(id))) return status;
  return null;
}

/**
 * Pointer drags: the card under the pointer, else the closest card of the
 * column under the pointer (so gaps between cards never jump to the column
 * end), else the column. Keyboard drags have no pointer: closest corners
 * across every column, which is what sortableKeyboardCoordinates expects.
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length === 0) return closestCorners(args);
  const cardHit = within.find((collision) => !isStatus(collision.id));
  const columnHit = within.find((collision) => isStatus(collision.id));
  const scope = cardHit
    ? args.droppableContainers.find((container) => container.id === cardHit.id)?.data.current?.sortable?.containerId
    : columnHit?.id;
  if (scope !== undefined) {
    const cards = args.droppableContainers.filter(
      (container) => !isStatus(container.id) && container.data.current?.sortable?.containerId === scope,
    );
    if (cards.length > 0) return closestCenter({ ...args, droppableContainers: cards });
  }
  return columnHit ? [columnHit] : within;
};

/** Mouse and pen start after a few pixels; touch is left to the press-and-hold TouchSensor. */
class MouseAndPenSensor extends PointerSensor {
  static activators: typeof PointerSensor.activators = [
    {
      eventName: "onPointerDown",
      handler: (event, options) =>
        event.nativeEvent.pointerType !== "touch" && PointerSensor.activators[0].handler(event, options),
    },
  ];
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Kanban board of tasks: one sortable column per status (Cancelled starts
 * collapsed). Cards move between and within columns by drag (mouse, touch
 * press-and-hold, or keyboard: Space to lift, arrows to move, Space/Enter to
 * drop, Escape to cancel) and through the status menu on every card. Moves
 * are optimistic (`moveTaskAction`) and revert with a toast on failure.
 * Keyboard: j/k move between cards, Enter opens, s opens the status menu and
 * a assigns to the viewer (useListNavigation).
 */
export function TaskBoard({
  tasks,
  projectId,
  milestones,
  showProject = false,
  today,
  defaultMilestoneId = null,
  parentKeys,
  viewerId,
  className,
}: TaskBoardProps) {
  const router = useRouter();
  const dndId = useId();
  const taskHref = useTaskHref();
  const reduceMotion = useReducedMotionConfig() === true;
  const trackRef = useRef<HTMLDivElement>(null);

  const [byId, setById] = useState(() => new Map(tasks.map((task) => [task.id, task])));
  const [columns, setColumns] = useState<Columns>(() => buildColumns(tasks));
  const [syncedTasks, setSyncedTasks] = useState(tasks);
  if (syncedTasks !== tasks) {
    setSyncedTasks(tasks);
    setById(new Map(tasks.map((task) => [task.id, task])));
    setColumns(buildColumns(tasks));
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null);
  const [cancelledOpen, setCancelledOpen] = useState(false);
  const [visibleStatus, setVisibleStatus] = useState<TaskStatus>(TASK_BOARD_COLUMNS[0]);
  const snapshot = useRef<{ columns: Columns; status: TaskStatus; index: number } | null>(null);

  /** Cards created here with quick add pop in; everything else uses the first-mount stagger only. */
  const [createdIds, setCreatedIds] = useState<ReadonlySet<string>>(() => new Set());

  const activeTask = activeId ? (byId.get(activeId) ?? null) : null;

  /** j/k walk the cards column by column (the collapsed Cancelled column is skipped); off while dragging. */
  const boardRef = useRef<HTMLDivElement>(null);
  const navIds = useMemo(
    () => TASK_BOARD_COLUMNS.flatMap((status) => (status === COLLAPSIBLE && !cancelledOpen ? [] : columns[status])),
    [columns, cancelledOpen],
  );
  useTaskListNavigation({ itemIds: navIds, tasksById: byId, viewerId, containerRef: boardRef, enabled: activeId === null });
  const milestoneName = defaultMilestoneId ? milestones?.find((item) => item.id === defaultMilestoneId)?.name : undefined;

  /** dnd-kit swallows the click that ends a touch drag; cancel stray link clicks right after a drop. */
  const suppressClickUntil = useRef(0);
  useEffect(() => {
    const onClick = (event: Event) => {
      if (performance.now() < suppressClickUntil.current) event.preventDefault();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  const sensors = useSensors(
    useSensor(MouseAndPenSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter opens the focused card; Space lifts it.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  // Phones: track which column is snapped to the start of the track (for the jump chips).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const padding = Number.parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
      let nearest: TaskStatus | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const column of track.querySelectorAll<HTMLElement>(`[${COLUMN_ATTRIBUTE}]`)) {
        const status = column.getAttribute(COLUMN_ATTRIBUTE);
        const distance = Math.abs(column.offsetLeft - padding - track.scrollLeft);
        if (isStatus(status) && distance < best) {
          nearest = status;
          best = distance;
        }
      }
      if (nearest) setVisibleStatus(nearest);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  function scrollToColumn(status: TaskStatus) {
    if (status === COLLAPSIBLE) setCancelledOpen(true);
    requestAnimationFrame(() => {
      const track = trackRef.current;
      const column = track?.querySelector<HTMLElement>(`[${COLUMN_ATTRIBUTE}="${status}"]`);
      if (!track || !column) return;
      const padding = Number.parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
      setVisibleStatus(status);
      track.scrollTo({ left: column.offsetLeft - padding, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }

  /* ------------------------------ Announcements ----------------------------- */

  const nameOf = (id: UniqueIdentifier) => {
    const task = byId.get(String(id));
    return task ? `${task.key}, ${task.title}` : "task";
  };
  const placeOf = (id: UniqueIdentifier, status: TaskStatus) => {
    const list = columns[status];
    const index = list.indexOf(String(id));
    const label = TASK_STATUS_CONFIG[status].label;
    return index >= 0 ? `${label}, position ${index + 1} of ${list.length}` : label;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${nameOf(active.id)}. Use the arrow keys to move it, Space to drop it, Escape to cancel.`,
    onDragOver: ({ active, over }) => {
      const status = over ? containerOf(columns, over.id) : null;
      return status ? `${nameOf(active.id)} is over ${placeOf(active.id, status)}.` : `${nameOf(active.id)} is not over a column.`;
    },
    onDragEnd: ({ active, over }) => {
      const status = over ? containerOf(columns, over.id) : null;
      return status ? `${nameOf(active.id)} was dropped in ${placeOf(active.id, status)}.` : `${nameOf(active.id)} was dropped.`;
    },
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  /* -------------------------------- Drag flow ------------------------------- */

  function handleDragStart({ active }: DragStartEvent) {
    const id = String(active.id);
    const status = containerOf(columns, id);
    if (!status) return;
    snapshot.current = { columns: cloneColumns(columns), status, index: columns[status].indexOf(id) };
    setActiveId(id);
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) {
      setOverColumn(null);
      return;
    }
    setOverColumn(containerOf(columns, over.id));
    setColumns((current) => {
      const from = containerOf(current, active.id);
      const to = containerOf(current, over.id);
      if (!from || !to || from === to) return current;
      // A collapsed column takes the card on drop only (it renders no cards to sort against).
      if (to === COLLAPSIBLE && !cancelledOpen) return current;
      const source = current[from];
      const target = current[to];
      const id = String(active.id);
      const overIndex = isStatus(over.id) ? -1 : target.indexOf(String(over.id));
      const translated = active.rect.current.translated;
      const below = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
      const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length;
      const next = cloneColumns(current);
      next[from] = source.filter((item) => item !== id);
      next[to] = [...target.slice(0, index), id, ...target.slice(index)];
      return next;
    });
  }

  function endDrag() {
    suppressClickUntil.current = performance.now() + 150;
    setActiveId(null);
    setOverColumn(null);
  }

  function handleDragCancel() {
    endDrag();
    if (snapshot.current) setColumns(snapshot.current.columns);
    snapshot.current = null;
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    endDrag();
    const start = snapshot.current;
    snapshot.current = null;
    const id = String(active.id);
    if (!start || !over) {
      if (start) setColumns(start.columns);
      return;
    }

    let next = cloneColumns(columns);
    const from = containerOf(next, id);
    const to = containerOf(next, over.id);
    if (!from || !to) {
      setColumns(start.columns);
      return;
    }
    if (from === to) {
      const oldIndex = next[to].indexOf(id);
      const newIndex = isStatus(over.id) ? oldIndex : next[to].indexOf(String(over.id));
      if (newIndex >= 0 && newIndex !== oldIndex) next[to] = arrayMove(next[to], oldIndex, newIndex);
    } else {
      // Dropped on the collapsed column: append there.
      next[from] = next[from].filter((item) => item !== id);
      next[to] = [...next[to], id];
    }

    const index = next[to].indexOf(id);
    if (to === start.status && index === start.index) {
      setColumns(start.columns);
      return;
    }
    next = commitMove(id, to, next, start.columns);
    setColumns(next);
  }

  /**
   * Persists a card's new place. Neighbours are the nearest cards above and
   * below in the same project (cross-project boards order each project's
   * cards independently).
   */
  function commitMove(id: string, status: TaskStatus, next: Columns, revertTo: Columns): Columns {
    const task = byId.get(id);
    if (!task) return revertTo;
    const list = next[status];
    const index = list.indexOf(id);
    const sameProject = (otherId: string) => byId.get(otherId)?.project_id === task.project_id;
    const before = [...list.slice(0, index)].reverse().find(sameProject) ?? null;
    const after = list.slice(index + 1).find(sameProject) ?? null;
    const statusChanged = task.status !== status;

    setById((current) => new Map(current).set(id, { ...task, status }));
    void (async () => {
      const result = await moveTaskAction(id, { status, before_id: before, after_id: after });
      if (!result.ok) {
        setColumns(revertTo);
        setById((current) => new Map(current).set(id, task));
        toast.error(result.error);
        return;
      }
      setById((current) => new Map(current).set(id, result.data));
      if (statusChanged) {
        toast.success(`${task.key} moved to ${TASK_STATUS_CONFIG[status].label}.`, { duration: 2500 });
      }
      router.refresh();
    })();
    return next;
  }

  /** Card status menu: moves the card to the end of the chosen column. */
  function changeStatus(id: string, status: TaskStatus) {
    const task = byId.get(id);
    if (!task || task.status === status) return;
    const revertColumns = cloneColumns(columns);
    const next = cloneColumns(columns);
    next[task.status] = next[task.status].filter((item) => item !== id);
    next[status] = [...next[status], id];
    setColumns(next);
    setById((current) => new Map(current).set(id, { ...task, status }));
    if (status === COLLAPSIBLE) setCancelledOpen(true);
    void (async () => {
      const result = await updateTaskStatusAction(id, status);
      if (!result.ok) {
        setColumns(revertColumns);
        setById((current) => new Map(current).set(id, task));
        toast.error(result.error);
        return;
      }
      setById((current) => new Map(current).set(id, result.data));
      toast.success(`${task.key} moved to ${TASK_STATUS_CONFIG[status].label}.`, { duration: 2500 });
      router.refresh();
    })();
  }

  function addCreated(task: TaskWithMeta) {
    setCreatedIds((current) => new Set(current).add(task.id));
    setById((current) => new Map(current).set(task.id, task));
    setColumns((current) => {
      if (current[task.status].includes(task.id)) return current;
      const next = cloneColumns(current);
      next[task.status] = [...next[task.status], task.id];
      return next;
    });
  }

  function openTask(id: string) {
    const task = byId.get(id);
    if (task) router.push(taskHref(task.key), { scroll: false });
  }

  return (
    <div ref={boardRef} className={cn("min-w-0", className)}>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Press Enter to open this task. To move it, press Space, use the arrow keys to move it within or between columns, then press Space again to drop it, or Escape to cancel.",
          },
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <BoardJumpChips columns={columns} current={visibleStatus} onSelect={scrollToColumn} />

        <div
          ref={trackRef}
          className={cn(
            BOARD_TRACK_CLASS,
            "items-start overflow-x-auto overscroll-x-contain",
            activeId === null ? "snap-x snap-mandatory md:snap-proximity" : "snap-none",
          )}
        >
          {TASK_BOARD_COLUMNS.map((status) => {
            const collapsed = status === COLLAPSIBLE && !cancelledOpen;
            const ids = columns[status];
            return collapsed ? (
              <CollapsedColumn
                key={status}
                status={status}
                count={ids.length}
                highlighted={activeId !== null && overColumn === status}
                onExpand={() => setCancelledOpen(true)}
              />
            ) : (
              <BoardColumn
                key={status}
                status={status}
                count={ids.length}
                highlighted={activeId !== null && overColumn === status && activeTask?.status !== status}
                onCollapse={status === COLLAPSIBLE ? () => setCancelledOpen(false) : undefined}
                footer={
                  projectId && status !== COLLAPSIBLE ? (
                    <TaskQuickAdd
                      projectId={projectId}
                      status={status}
                      milestoneId={defaultMilestoneId}
                      placeholder={milestoneName ? `Task in ${milestoneName}` : undefined}
                      onCreated={addCreated}
                    />
                  ) : null
                }
              >
                <SortableContext id={status} items={ids} strategy={verticalListSortingStrategy}>
                  {/* Always mounted, so a column that fills up later never replays the first-mount reveal. */}
                  <Stagger className={cn("flex flex-col gap-2", ids.length === 0 && "hidden")}>
                    {ids.map((id) => {
                      const task = byId.get(id);
                      if (!task) return null;
                      return (
                        <SortableTaskCard
                          key={id}
                          task={task}
                          today={today}
                          showProject={showProject}
                          parentKey={task.parent_task_id ? (parentKeys?.[task.parent_task_id] ?? null) : null}
                          dragging={id === activeId}
                          pop={createdIds.has(id)}
                          onOpen={openTask}
                          onStatusChange={changeStatus}
                        />
                      );
                    })}
                  </Stagger>
                </SortableContext>
                {ids.length === 0 ? (
                  <p
                    className={cn(
                      "flex min-h-20 items-center justify-center rounded-[14px] border border-dashed px-3 py-4 text-center text-xs",
                      "transition-colors duration-(--dur-2)",
                      overColumn === status && activeId !== null
                        ? "border-accent/50 text-fg-muted"
                        : "border-border text-fg-subtle",
                    )}
                  >
                    {overColumn === status && activeId !== null
                      ? `Drop to move to ${TASK_STATUS_CONFIG[status].label}`
                      : `No ${TASK_STATUS_CONFIG[status].label.toLowerCase()} tasks.`}
                  </p>
                ) : null}
              </BoardColumn>
            );
          })}
        </div>

        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
          {/* dnd-kit measures this outer box: keep it untransformed; the lift animates one level down. */}
          {activeTask ? (
            <div className="cursor-grabbing">
              <m.div
                initial={{ scale: 1, rotate: 0 }}
                animate={reduceMotion ? { scale: 1, rotate: 0 } : { scale: 1.02, rotate: 1 }}
                transition={MOTION.spring}
                className="rounded-2xl shadow-pop"
              >
                <TaskCard
                  task={activeTask}
                  today={today}
                  showProject={showProject}
                  focusableLink={false}
                  parentKey={activeTask.parent_task_id ? (parentKeys?.[activeTask.parent_task_id] ?? null) : null}
                />
              </m.div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/* -------------------------------- Columns -------------------------------- */

interface BoardColumnProps {
  status: TaskStatus;
  count: number;
  highlighted: boolean;
  onCollapse?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

function BoardColumn({ status, count, highlighted, onCollapse, footer, children }: BoardColumnProps) {
  const config = TASK_STATUS_CONFIG[status];
  const { setNodeRef } = useDroppable({ id: status });
  const headingId = `task-column-${status}`;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-task-column={status}
      className={cn(
        BOARD_COLUMN_CLASS,
        "flex min-w-0 flex-col self-stretch rounded-2xl border border-border bg-surface-2/60",
        "transition-[background-color,border-color] duration-(--dur-2)",
        highlighted && "border-accent/40 bg-accent-soft/60",
      )}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <TaskStatusIcon status={status} />
        <h2 id={headingId} className="min-w-0 truncate text-sm font-semibold text-fg">
          {config.label}
        </h2>
        <span
          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface px-1.5 text-[11px] font-medium tabular-nums text-fg-muted ring-1 ring-inset ring-border"
          aria-label={`${count} ${count === 1 ? "task" : "tasks"}`}
        >
          {count}
        </span>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            aria-label={`Collapse ${config.label}`}
            title={`Collapse ${config.label}`}
            className="relative ml-auto inline-flex size-7 items-center justify-center rounded-full text-fg-subtle outline-none transition-colors duration-(--dur-2) hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5"
          >
            <ChevronsRightLeft aria-hidden className="size-4" />
          </button>
        ) : null}
      </header>
      <div className="flex min-h-12 flex-1 flex-col gap-2 px-2 pb-2">{children}</div>
      {footer ? <footer className="px-2 pb-2">{footer}</footer> : null}
    </section>
  );
}

interface CollapsedColumnProps {
  status: TaskStatus;
  count: number;
  highlighted: boolean;
  onExpand: () => void;
}

/** A narrow strip that still accepts drops; opening it shows the cards. */
function CollapsedColumn({ status, count, highlighted, onExpand }: CollapsedColumnProps) {
  const config = TASK_STATUS_CONFIG[status];
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${config.label}, ${count} ${count === 1 ? "task" : "tasks"}, collapsed`}
      data-task-column={status}
      className={cn(
        "flex w-14 shrink-0 snap-start self-stretch rounded-2xl border border-dashed border-border bg-surface-2/40",
        "transition-[background-color,border-color] duration-(--dur-2)",
        highlighted && "border-accent/50 bg-accent-soft/60",
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-expanded={false}
        aria-label={`Show ${config.label} (${count})`}
        className="flex w-full flex-col items-center gap-3 rounded-2xl py-3 text-fg-muted outline-none transition-colors duration-(--dur-2) hover:text-fg focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronsLeftRight aria-hidden className="size-4" />
        <TaskStatusIcon status={status} />
        <span className="text-xs font-medium [writing-mode:vertical-rl]">{config.label}</span>
        <span className="text-[11px] tabular-nums text-fg-subtle">{count}</span>
      </button>
    </section>
  );
}

/* ---------------------------------- Card ---------------------------------- */

interface SortableTaskCardProps {
  task: TaskWithMeta;
  today: string;
  showProject: boolean;
  parentKey: string | null;
  dragging: boolean;
  /** Just created with quick add: pops in (other cards only take part in the first-mount stagger). */
  pop: boolean;
  onOpen: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}

function SortableTaskCard({
  task,
  today,
  showProject,
  parentKey,
  dragging,
  pop,
  onOpen,
  onStatusChange,
}: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    // "group", not dnd-kit's default "button": a button role would flatten the status menu and title link inside.
    attributes: { role: "group", roleDescription: "draggable task card" },
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // While this card is being moved, Enter drops it (KeyboardSensor) instead of opening it.
    if (event.key === "Enter" && !dragging && event.target === event.currentTarget && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onOpen(task.id);
      return;
    }
    listeners?.onKeyDown?.(event);
  };

  const cancelNativeDrag = (event: DragEvent) => event.preventDefault();
  const card = (
    <TaskCard
      task={task}
      today={today}
      showProject={showProject}
      focusableLink={false}
      parentKey={parentKey}
      onStatusChange={(status) => onStatusChange(task.id, status)}
    />
  );

  return (
    <div
      ref={setNodeRef}
      data-list-item-id={task.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={`${task.key}, ${task.title}, ${TASK_STATUS_CONFIG[task.status].label}`}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onDragStart={cancelNativeDrag}
      className={cn(
        "min-w-0 cursor-grab touch-manipulation select-none rounded-2xl outline-none [-webkit-touch-callout:none]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
        dragging && "opacity-40",
      )}
    >
      {/* Motion lives on this inner wrapper, never on the sortable node itself. */}
      {pop ? (
        <m.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={MOTION.springNoBounce}>
          {card}
        </m.div>
      ) : (
        <StaggerItem>{card}</StaggerItem>
      )}
    </div>
  );
}

/* ------------------------------- Jump chips ------------------------------- */

interface BoardJumpChipsProps {
  columns: Columns;
  current: TaskStatus;
  onSelect: (status: TaskStatus) => void;
}

/** Phones only: one chip per column that scrolls the board to it. */
function BoardJumpChips({ columns, current, onSelect }: BoardJumpChipsProps) {
  return (
    <nav aria-label="Board columns" className="md:hidden">
      <div className="relative -mx-4 mb-3 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 py-0.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
        {TASK_BOARD_COLUMNS.map((status) => {
          const active = status === current;
          const count = columns[status].length;
          return (
            <button
              key={status}
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(status)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none",
                "transition-colors duration-(--dur-2) focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-accent/50 bg-accent-soft text-fg" : "border-border bg-surface text-fg-muted hover:text-fg",
              )}
            >
              <TaskStatusIcon status={status} className="size-3.5" />
              {TASK_STATUS_CONFIG[status].label}
              <span className="tabular-nums text-fg-subtle">{count}</span>
              <span className="sr-only"> {count === 1 ? "task" : "tasks"}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
