"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
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
  type Over,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { updateProjectStatusAction } from "@/actions/projects";
import { Stagger, StaggerItem, useReducedMotionPreference } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { STATUS_CONFIG, STATUS_ORDER } from "@/lib/constants";
import type { ProjectStatus, ProjectWithMeta, UserSummary, WorkspaceDateContext } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BOARD_COLUMN_CLASS, BOARD_TRACK_CLASS } from "./board-layout";
import { ProjectCard } from "./project-card";
import { ProjectDialog } from "./project-dialog";

export interface ProjectBoardProps {
  projects: ProjectWithMeta[];
  users: UserSummary[];
  /** Workspace today, timezone and update cadence; cards show "Update due" and workspace-time due dates. */
  workspace?: WorkspaceDateContext;
  /** The viewer's favourite project ids: cards show a star toggle when given. */
  favoriteIds?: string[];
  className?: string;
}

interface CardData {
  type: "card";
  status: ProjectStatus;
}

interface ColumnData {
  type: "column";
  status: ProjectStatus;
}

type DragData = CardData | ColumnData;

function isStatus(value: UniqueIdentifier | undefined): value is ProjectStatus {
  return typeof value === "string" && value in STATUS_CONFIG;
}

/** The column a drop target belongs to: the column itself, or the column of the card hovered. */
function statusOf(over: Over | null): ProjectStatus | null {
  if (!over) return null;
  const data = over.data.current as DragData | undefined;
  if (data?.status) return data.status;
  return isStatus(over.id) ? over.id : null;
}

/**
 * Pointer users drop where the cursor is; keyboard users (no pointer) fall
 * back to the nearest corners so every column stays reachable.
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCorners(args);
};

/**
 * Mouse and pen drags start after a few pixels of movement. Touch is left to
 * the TouchSensor below: a touch press must stay put briefly before it picks a
 * card up, so swiping across the board still scrolls it.
 */
class MouseAndPenSensor extends PointerSensor {
  static activators: typeof PointerSensor.activators = [
    {
      eventName: "onPointerDown",
      handler: (event, options) =>
        event.nativeEvent.pointerType !== "touch" && PointerSensor.activators[0].handler(event, options),
    },
  ];
}

/** Set on each column section; the phone jump chips find columns by it. */
const COLUMN_ATTRIBUTE = "data-board-column";

/** Where a column's left edge sits when it is snapped to the start of the track. */
function snapOffset(track: HTMLElement, column: HTMLElement): number {
  const padding = Number.parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
  return column.offsetLeft - padding;
}

function groupByStatus(projects: ProjectWithMeta[]): Record<ProjectStatus, ProjectWithMeta[]> {
  const groups: Record<ProjectStatus, ProjectWithMeta[]> = {
    to_start: [],
    ongoing: [],
    on_hold: [],
    completed: [],
    cancelled: [],
  };
  for (const project of projects) groups[project.status].push(project);
  return groups;
}

/**
 * Kanban board: one droppable column per status, sortable cards inside each.
 * Moving a card to another column updates it optimistically and persists via
 * `updateProjectStatusAction`; failures revert the card and toast.
 *
 * Layout (see board-layout.ts): phones show one ~85vw column at a time with
 * snap scrolling and a row of jump chips; from md the columns are fluid and
 * fill the row, scrolling sideways only while the five do not fit.
 */
export function ProjectBoard({ projects, users, workspace, favoriteIds, className }: ProjectBoardProps) {
  const router = useRouter();
  const dndId = useId();
  const [, startTransition] = useTransition();
  const trackRef = useRef<HTMLDivElement>(null);
  // Follows the app Motion setting (System / Reduced / Full), not only the OS query.
  const reduced = useReducedMotionPreference();

  const [items, setItems] = useState(projects);
  const [syncedProjects, setSyncedProjects] = useState(projects);
  // Adopt fresh server data (after router.refresh or a filter change).
  if (syncedProjects !== projects) {
    setSyncedProjects(projects);
    setItems(projects);
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<ProjectStatus | null>(null);
  /** Column snapped to the start of the track (drives the phone jump chips). */
  const [visibleStatus, setVisibleStatus] = useState<ProjectStatus>(STATUS_ORDER[0]);

  const columns = useMemo(() => groupByStatus(items), [items]);
  const activeProject = activeId ? items.find((project) => project.id === activeId) ?? null : null;

  /**
   * A touch drag that ends without the finger moving (a slow tap past the hold
   * delay) is still followed by a click on the card link. dnd-kit stops that
   * click's propagation at the document, so Next's Link never sees it and the
   * browser would do a full page load. Cancel it on window (capture phase runs
   * before the document) for a moment after any drag ends.
   */
  const suppressClickUntil = useRef(0);
  useEffect(() => {
    const onClick = (event: Event) => {
      if (performance.now() < suppressClickUntil.current) event.preventDefault();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  const sensors = useSensors(
    // A small distance threshold keeps plain clicks on the card link working.
    useSensor(MouseAndPenSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold to pick a card up on touch screens; moving earlier scrolls instead.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Track which column is at the start of the track as it scrolls.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      let nearest: ProjectStatus | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const column of track.querySelectorAll<HTMLElement>(`[${COLUMN_ATTRIBUTE}]`)) {
        const status = column.getAttribute(COLUMN_ATTRIBUTE) ?? undefined;
        const distance = Math.abs(snapOffset(track, column) - track.scrollLeft);
        if (isStatus(status) && distance < nearestDistance) {
          nearest = status;
          nearestDistance = distance;
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

  function scrollToColumn(status: ProjectStatus) {
    const track = trackRef.current;
    const column = track?.querySelector<HTMLElement>(`[${COLUMN_ATTRIBUTE}="${status}"]`);
    if (!track || !column) return;
    setVisibleStatus(status);
    track.scrollTo({ left: snapOffset(track, column), behavior: reduced ? "auto" : "smooth" });
  }

  const nameOf = (id: UniqueIdentifier) => items.find((project) => project.id === id)?.name ?? "project";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}. Use the arrow keys to move it to another column.`,
    onDragOver: ({ active, over }) => {
      const status = statusOf(over);
      return status
        ? `${nameOf(active.id)} is over ${STATUS_CONFIG[status].label}.`
        : `${nameOf(active.id)} is no longer over a column.`;
    },
    onDragEnd: ({ active, over }) => {
      const status = statusOf(over);
      return status
        ? `${nameOf(active.id)} was dropped in ${STATUS_CONFIG[status].label}.`
        : `${nameOf(active.id)} was dropped.`;
    },
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  function handleDragOver({ over }: DragOverEvent) {
    setOverStatus(statusOf(over));
  }

  // dnd-kit calls both synchronously on pointerup/touchend, before the browser dispatches the click.
  function handleDragCancel() {
    suppressClickUntil.current = performance.now() + 150;
    setActiveId(null);
    setOverStatus(null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    suppressClickUntil.current = performance.now() + 150;
    setActiveId(null);
    setOverStatus(null);

    const target = statusOf(over);
    const id = String(active.id);
    const project = items.find((item) => item.id === id);
    if (!target || !project || project.status === target) return;

    moveProject(project, target);
  }

  function moveProject(project: ProjectWithMeta, target: ProjectStatus) {
    const from = project.status;
    const apply = (status: ProjectStatus) =>
      setItems((current) => current.map((item) => (item.id === project.id ? { ...item, status } : item)));

    apply(target);
    startTransition(async () => {
      const result = await updateProjectStatusAction(project.id, target);
      if (!result.ok) {
        apply(from);
        toast.error(result.error);
        return;
      }
      toast.success(`Moved "${project.name}" to ${STATUS_CONFIG[target].label}`, { duration: 2500 });
      router.refresh();
    });
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <BoardJumpChips columns={columns} current={visibleStatus} reduced={reduced} onSelect={scrollToColumn} />

      <div
        ref={trackRef}
        className={cn(
          BOARD_TRACK_CLASS,
          "overflow-x-auto overscroll-x-contain",
          // Snap one column at a time on phones; gentler snapping once several columns show.
          // Snapping is off mid-drag so auto-scrolling toward the next column is not undone.
          activeId === null ? "snap-x snap-mandatory md:snap-proximity" : "snap-none",
          className,
        )}
      >
        {STATUS_ORDER.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            projects={columns[status]}
            users={users}
            workspace={workspace}
            favoriteIds={favoriteIds}
            activeId={activeId}
            highlighted={activeId !== null && overStatus === status && activeProject?.status !== status}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={reduced ? null : { duration: 150, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
        {/*
          The overlay takes the picked-up card's measured size, so it matches fluid columns.
          dnd-kit measures the overlay's only child: keep that box untransformed (the tilt is
          one level down) so keyboard moves start from the card's true position.
        */}
        {activeProject ? (
          <div className="cursor-grabbing">
            <div className="rotate-[1.5deg] motion-reduce:rotate-0">
              <ProjectCard project={activeProject} workspace={workspace} className="border-border-strong shadow-pop" />
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ------------------------------ Jump chips ------------------------------ */

interface BoardJumpChipsProps {
  columns: Record<ProjectStatus, ProjectWithMeta[]>;
  current: ProjectStatus;
  /** Reduced motion (app setting): jump instead of smooth-scrolling. */
  reduced: boolean;
  onSelect: (status: ProjectStatus) => void;
}

/**
 * Phones only: one chip per column (label + count) that scrolls the board to
 * that column. The chip of the column in view is highlighted and kept visible.
 */
function BoardJumpChips({ columns, current, reduced, onSelect }: BoardJumpChipsProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>(`[data-status="${current}"]`);
    // Hidden from md up (no width): nothing to keep in view.
    if (!row || !chip || row.clientWidth === 0) return;
    const gutter = 16;
    const start = chip.offsetLeft - gutter;
    const end = chip.offsetLeft + chip.offsetWidth + gutter;
    const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
    if (start < row.scrollLeft) row.scrollTo({ left: start, behavior });
    else if (end > row.scrollLeft + row.clientWidth) row.scrollTo({ left: end - row.clientWidth, behavior });
  }, [current, reduced]);

  return (
    <nav aria-label="Board columns" className="md:hidden">
      <div
        ref={rowRef}
        className="relative -mx-4 mb-3 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 py-0.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {STATUS_ORDER.map((status) => {
          const config = STATUS_CONFIG[status];
          const count = columns[status].length;
          const active = status === current;
          return (
            <button
              key={status}
              type="button"
              data-status={status}
              aria-current={active ? "true" : undefined}
              onClick={() => onSelect(status)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none",
                "transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-accent/50 bg-accent-soft text-fg"
                  : "border-border bg-surface text-fg-muted hover:text-fg",
              )}
            >
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", config.dotClass)} />
              {config.label}
              <span className="tabular-nums text-fg-subtle">{count}</span>
              <span className="sr-only"> {count === 1 ? "project" : "projects"}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* -------------------------------- Column -------------------------------- */

interface BoardColumnProps {
  status: ProjectStatus;
  projects: ProjectWithMeta[];
  users: UserSummary[];
  workspace?: WorkspaceDateContext;
  favoriteIds?: string[];
  activeId: string | null;
  highlighted: boolean;
}

function BoardColumn({ status, projects, users, workspace, favoriteIds, activeId, highlighted }: BoardColumnProps) {
  const config = STATUS_CONFIG[status];
  const data: ColumnData = { type: "column", status };
  // The whole column is the drop target, so a card can be dropped anywhere along it
  // (columns stretch to the tallest one), not only on the cards area.
  const { setNodeRef } = useDroppable({ id: status, data });
  const ids = useMemo(() => projects.map((project) => project.id), [projects]);
  const headingId = `board-column-${status}`;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      data-board-column={status}
      className={cn(
        BOARD_COLUMN_CLASS,
        "flex min-w-0 flex-col rounded-2xl border border-border bg-surface-2/60 transition-colors duration-150",
        highlighted && "border-accent/40 bg-accent-soft/50",
      )}
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", config.dotClass)} />
        <h2 id={headingId} className="min-w-0 truncate text-sm font-semibold text-fg">
          {config.label}
        </h2>
        <span
          className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface px-1.5 text-[11px] font-medium tabular-nums text-fg-muted ring-1 ring-inset ring-border"
          aria-label={`${projects.length} in ${config.label}`}
        >
          {projects.length}
        </span>
      </header>

      <div className="flex flex-col gap-2 px-2 pb-2">
        <SortableContext id={status} items={ids} strategy={verticalListSortingStrategy}>
          {projects.length > 0 ? (
            <Stagger className="flex flex-col gap-2">
              {projects.map((project) => (
                <DraggableCard
                  key={project.id}
                  project={project}
                  workspace={workspace}
                  favorite={favoriteIds ? favoriteIds.includes(project.id) : undefined}
                  dragging={project.id === activeId}
                />
              ))}
            </Stagger>
          ) : null}
        </SortableContext>
        {projects.length === 0 ? (
          <p
            className={cn(
              "flex min-h-20 items-center justify-center rounded-md border border-dashed px-3 py-4 text-center text-xs transition-colors duration-150",
              highlighted ? "border-accent/50 text-fg-muted" : "border-border text-fg-subtle",
            )}
          >
            {highlighted ? `Drop to mark as ${config.label}` : `No ${config.label.toLowerCase()} projects`}
          </p>
        ) : null}
      </div>

      <footer className="px-2 pb-2">
        <ProjectDialog
          mode="create"
          users={users}
          defaultStatus={status}
          trigger={
            <Button variant="ghost" size="sm" className="w-full justify-start text-fg-muted">
              <Plus aria-hidden />
              Add
              <span className="sr-only"> project to {config.label}</span>
            </Button>
          }
        />
      </footer>
    </section>
  );
}

/* --------------------------------- Card --------------------------------- */

interface DraggableCardProps {
  project: ProjectWithMeta;
  workspace?: WorkspaceDateContext;
  /** Undefined = no star on the card. */
  favorite?: boolean;
  dragging: boolean;
}

function DraggableCard({ project, workspace, favorite, dragging }: DraggableCardProps) {
  const data: CardData = { type: "card", status: project.status };
  // Cards are not reordered inside a column (the sort select owns the order), so the
  // sortable transform is deliberately not applied; the DragOverlay shows the movement.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useSortable({
    id: project.id,
    data,
    attributes: { roleDescription: "draggable project card" },
  });

  /**
   * The inner anchor is natively draggable; cancel that so dnd-kit owns the gesture.
   * (While a press is held, dnd-kit itself cancels the link's context menu on window.)
   */
  const cancelNativeDrag = (event: DragEvent) => event.preventDefault();

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      onDragStart={cancelNativeDrag}
      aria-label={`${project.name}, in ${STATUS_CONFIG[project.status].label}`}
      {...attributes}
      {...listeners}
      className={cn(
        "min-w-0 cursor-grab touch-manipulation select-none rounded-2xl outline-none [-webkit-touch-callout:none]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
        "transition-opacity duration-(--dur-2)",
        dragging && "opacity-40",
      )}
    >
      {/* The reveal animates this inner wrapper, never the sortable node itself. */}
      <StaggerItem>
        <ProjectCard project={project} workspace={workspace} favorite={favorite} />
      </StaggerItem>
    </div>
  );
}
