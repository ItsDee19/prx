"use client";

import { useId, useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
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
import { Button } from "@/components/ui/button";
import { STATUS_CONFIG, STATUS_ORDER } from "@/lib/constants";
import type { ProjectStatus, ProjectWithMeta, UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProjectCard } from "./project-card";
import { ProjectDialog } from "./project-dialog";

export interface ProjectBoardProps {
  projects: ProjectWithMeta[];
  users: UserSummary[];
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
 */
export function ProjectBoard({ projects, users, className }: ProjectBoardProps) {
  const router = useRouter();
  const dndId = useId();
  const [, startTransition] = useTransition();

  const [items, setItems] = useState(projects);
  const [syncedProjects, setSyncedProjects] = useState(projects);
  // Adopt fresh server data (after router.refresh or a filter change).
  if (syncedProjects !== projects) {
    setSyncedProjects(projects);
    setItems(projects);
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<ProjectStatus | null>(null);

  const columns = useMemo(() => groupByStatus(items), [items]);
  const activeProject = activeId ? items.find((project) => project.id === activeId) ?? null : null;

  const sensors = useSensors(
    // A small distance threshold keeps plain clicks on the card link working.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  function handleDragCancel() {
    setActiveId(null);
    setOverStatus(null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
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
      <div
        className={cn(
          "-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
          className,
        )}
      >
        {STATUS_ORDER.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            projects={columns[status]}
            users={users}
            activeId={activeId}
            highlighted={activeId !== null && overStatus === status && activeProject?.status !== status}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
        {activeProject ? (
          <div className="w-72 rotate-[1.5deg] cursor-grabbing">
            <ProjectCard project={activeProject} className="border-border-strong shadow-xl" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* -------------------------------- Column -------------------------------- */

interface BoardColumnProps {
  status: ProjectStatus;
  projects: ProjectWithMeta[];
  users: UserSummary[];
  activeId: string | null;
  highlighted: boolean;
}

function BoardColumn({ status, projects, users, activeId, highlighted }: BoardColumnProps) {
  const config = STATUS_CONFIG[status];
  const data: ColumnData = { type: "column", status };
  const { setNodeRef } = useDroppable({ id: status, data });
  const ids = useMemo(() => projects.map((project) => project.id), [projects]);
  const headingId = `board-column-${status}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-72 shrink-0 snap-start flex-col rounded-lg border border-border bg-surface-2/60"
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", config.dotClass)} />
        <h2 id={headingId} className="text-sm font-semibold text-fg">
          {config.label}
        </h2>
        <span
          className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 text-[11px] font-medium tabular-nums text-fg-muted ring-1 ring-inset ring-border"
          aria-label={`${projects.length} in ${config.label}`}
        >
          {projects.length}
        </span>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-md px-2 pb-2 transition-colors duration-150",
          highlighted && "bg-accent-soft/60 ring-1 ring-inset ring-accent/40",
        )}
      >
        <SortableContext id={status} items={ids} strategy={verticalListSortingStrategy}>
          {projects.map((project) => (
            <DraggableCard key={project.id} project={project} dragging={project.id === activeId} />
          ))}
        </SortableContext>
        {projects.length === 0 ? (
          <p className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-fg-subtle">
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
  dragging: boolean;
}

function DraggableCard({ project, dragging }: DraggableCardProps) {
  const data: CardData = { type: "card", status: project.status };
  // Cards are not reordered inside a column (the sort select owns the order), so the
  // sortable transform is deliberately not applied; the DragOverlay shows the movement.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useSortable({
    id: project.id,
    data,
    attributes: { roleDescription: "draggable project card" },
  });

  /** The inner anchor is natively draggable; cancel that so dnd-kit owns the gesture. */
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
        "cursor-grab touch-manipulation rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
        dragging && "opacity-40",
      )}
    >
      <ProjectCard project={project} />
    </div>
  );
}
