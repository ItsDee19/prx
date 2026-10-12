"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { CalendarOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { updateTaskAction } from "@/actions/tasks";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MOTION } from "@/lib/constants";
import type { CalendarEntry, CalendarTaskEntry } from "@/lib/data/calendar";
import type { UpdateTaskInput } from "@/lib/types";
import { cn, dispatchAppCommand, pluralize } from "@/lib/utils";
import { addDaysISO, diffDaysISO, isDateOnly, isWeekendISO } from "@/lib/workspace-time";
import { CalendarChipContent, CalendarItemLink, chipClassName, type ChipDensity } from "./calendar-chip";
import {
  calendarRange,
  dayOfMonth,
  longDayLabel,
  monthShort,
  shortDayLabel,
  WEEKDAY_SHORT,
  type CalendarViewMode,
} from "./calendar-dates";
import { CALENDAR_CHIP_KIND_ORDER, CALENDAR_CHIP_KINDS } from "./calendar-kinds";

export interface CalendarViewProps {
  items: CalendarEntry[];
  view: CalendarViewMode;
  /** Anchor date of the visible period. */
  anchor: string;
  /** Workspace today. */
  today: string;
  /** Quick create prefills this project (the calendar's project filter). */
  projectId?: string;
  /** A navigation (period or filter change) is in flight. */
  pending?: boolean;
}

/** Month cells show this many chips; more collapse into "+N more". */
const MONTH_MAX_CHIPS = 3;
const DAY_PREFIX = "day:";

function dayDroppableId(date: string): string {
  return `${DAY_PREFIX}${date}`;
}

function dateOfDroppable(id: UniqueIdentifier | null | undefined): string | null {
  if (typeof id !== "string" || !id.startsWith(DAY_PREFIX)) return null;
  const date = id.slice(DAY_PREFIX.length);
  return isDateOnly(date) ? date : null;
}

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

const KEY_DAY_DELTAS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * Keyboard drags move a day at a time (left/right) or a week (up/down) by
 * placing the chip inside the target day's cell; days outside the visible
 * period are not reachable (change the period, or edit the due date).
 */
const dayKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const delta = KEY_DAY_DELTAS[event.code];
  if (delta === undefined) return undefined;
  event.preventDefault();
  const { active, over, droppableRects, collisionRect } = context;
  if (!active || !collisionRect) return undefined;
  const fromDate = dateOfDroppable(over?.id) ?? (active.data.current?.date as string | undefined) ?? null;
  if (!fromDate) return undefined;
  const rect = droppableRects.get(dayDroppableId(addDaysISO(fromDate, delta)));
  if (!rect) return undefined;
  return { x: rect.left + 6, y: rect.top + Math.min(32, Math.max(0, rect.height - collisionRect.height) / 2) };
};

/** Pointer drags use the cell under the pointer; keyboard drags the cell the chip sits in. */
const collisionDetection: CollisionDetection = (args) => {
  if (args.pointerCoordinates) {
    const within = pointerWithin(args);
    if (within.length > 0) return within;
  }
  return rectIntersection(args);
};

function groupByDate(items: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const map = new Map<string, CalendarEntry[]>();
  for (const item of items) {
    const list = map.get(item.date);
    if (list) list.push(item);
    else map.set(item.date, [item]);
  }
  return map;
}

function openQuickCreate(date: string, projectId: string | undefined) {
  dispatchAppCommand({ type: "new-task", dueDate: date, projectId: projectId || undefined });
}

/**
 * Month grid (Monday first) or week columns from `sm` up, an agenda list
 * below `sm`. Task chips drag to another day to reschedule (mouse, touch
 * press-and-hold, or keyboard: Space to lift, arrows to pick a day, Space to
 * drop); the due-date field in the task drawer is the other keyboard path.
 * Moves are optimistic (`updateTaskAction`) and revert with a toast on failure.
 */
export function CalendarView({ items: serverItems, view, anchor, today, projectId, pending = false }: CalendarViewProps) {
  const router = useRouter();
  const dndId = useId();
  const reduceMotion = useReducedMotionConfig() === true;
  const range = useMemo(() => calendarRange(view, anchor), [view, anchor]);

  // Optimistic copy of the server items, reset whenever the server sends new ones.
  const [items, setItems] = useState(serverItems);
  const [syncedItems, setSyncedItems] = useState(serverItems);
  if (syncedItems !== serverItems) {
    setSyncedItems(serverItems);
    setItems(serverItems);
  }

  // Direction of the last period change, for the slide of the incoming grid (0 = first render).
  const [shownStart, setShownStart] = useState(range.start);
  const [direction, setDirection] = useState(0);
  if (shownStart !== range.start) {
    setDirection(range.start > shownStart ? 1 : -1);
    setShownStart(range.start);
  }

  const byDate = useMemo(() => groupByDate(items), [items]);
  const order = useMemo(() => new Map(serverItems.map((item, index) => [item.id, index])), [serverItems]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeItem = activeId ? (items.find((item) => item.id === activeId) ?? null) : null;

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
      coordinateGetter: dayKeyboardCoordinates,
      // Enter opens the focused task; Space lifts it.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const taskOf = (id: UniqueIdentifier): CalendarTaskEntry | null => {
    const item = items.find((entry) => entry.id === id);
    return item && item.kind === "task" ? item : null;
  };
  const nameOf = (id: UniqueIdentifier) => {
    const task = taskOf(id);
    return task ? `${task.task_key}, ${task.title}` : "task";
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const task = taskOf(active.id);
      return `Picked up ${nameOf(active.id)}${task ? `, due ${longDayLabel(task.date)}` : ""}. Use the arrow keys to pick a day, Space to drop it, Escape to cancel.`;
    },
    onDragOver: ({ active, over }) => {
      const date = dateOfDroppable(over?.id);
      return date ? `${nameOf(active.id)} is over ${longDayLabel(date)}.` : `${nameOf(active.id)} is not over a day.`;
    },
    onDragEnd: ({ active, over }) => {
      const date = dateOfDroppable(over?.id);
      const task = taskOf(active.id);
      if (!date) return `${nameOf(active.id)} was dropped outside the calendar. Its due date did not change.`;
      if (task && task.date === date) return `${nameOf(active.id)} was dropped on its current day.`;
      return `${nameOf(active.id)} was moved to ${longDayLabel(date)}.`;
    },
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled. Its due date did not change.`,
  };

  function sortItems(list: CalendarEntry[]): CalendarEntry[] {
    // Server order inside a day until the refresh brings the canonical order back.
    return [...list].sort(
      (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    );
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
  }

  function endDrag() {
    suppressClickUntil.current = performance.now() + 150;
    setActiveId(null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    endDrag();
    const task = taskOf(active.id);
    const date = dateOfDroppable(over?.id);
    if (!task || !date || date === task.date) return;
    reschedule(task, date);
  }

  /** Moves the due date; a start date that would fall after it moves by the same number of days. */
  function reschedule(task: CalendarTaskEntry, date: string) {
    const patch: UpdateTaskInput = { due_date: date };
    let startDate = task.start_date;
    if (startDate && date < startDate) {
      startDate = addDaysISO(startDate, diffDaysISO(task.date, date));
      patch.start_date = startDate;
    }
    const moved: CalendarTaskEntry = { ...task, date, start_date: startDate };
    setItems((current) => sortItems(current.map((item) => (item.id === task.id ? moved : item))));
    void (async () => {
      const result = await updateTaskAction(task.entity_id, patch);
      if (!result.ok) {
        setItems((current) => sortItems(current.map((item) => (item.id === task.id ? task : item))));
        toast.error(result.error);
        return;
      }
      toast.success(`${task.task_key} is now due ${shortDayLabel(date)}.`, { duration: 2500 });
      router.refresh();
    })();
  }

  const create = (date: string) => openQuickCreate(date, projectId);
  const dragging = activeId !== null;
  const density: ChipDensity = view === "month" ? "compact" : "comfortable";
  const agendaDays = range.weeks
    .flat()
    .filter((date) => view === "week" || date.slice(0, 7) === range.month);

  return (
    <div className={cn("min-w-0 transition-opacity duration-(--dur-3)", pending && "opacity-70")} aria-busy={pending || undefined}>
      {/* sm and up: the grid. */}
      <div className="hidden sm:block">
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={collisionDetection}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                "Press Enter to open this task. To reschedule it, press Space, use the arrow keys to pick a day (left and right move a day, up and down move a week), then press Space again to drop it, or Escape to cancel. You can also change the due date in the task.",
            },
          }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={endDrag}
        >
          <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-surface shadow-card">
            <div className={cn(view === "month" ? "min-w-[44rem]" : "min-w-[52rem]")}>
              <div aria-hidden className="grid grid-cols-7 border-b border-border bg-surface-2/50">
                {WEEKDAY_SHORT.map((label, index) => {
                  const date = view === "week" ? range.weeks[0][index] : null;
                  return (
                    <div
                      key={label}
                      className={cn(
                        "px-2.5 py-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle",
                        date === today && "text-accent",
                      )}
                    >
                      {label}
                      {date ? <span className="ml-1 tabular-nums">{dayOfMonth(date)}</span> : null}
                    </div>
                  );
                })}
              </div>
              <div className="overflow-hidden">
                <m.div
                  key={range.start}
                  initial={direction === 0 ? false : { opacity: 0, x: direction * 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: MOTION.duration.pageEnter, ease: MOTION.ease.outExpo }}
                >
                  {range.weeks.map((week) => (
                    <div key={week[0]} className="grid grid-cols-7 divide-x divide-border border-b border-border last:border-b-0">
                      {week.map((date) => (
                        <DayCell
                          key={date}
                          date={date}
                          items={byDate.get(date) ?? []}
                          view={view}
                          today={today}
                          inMonth={view === "week" || date.slice(0, 7) === range.month}
                          dragging={dragging}
                          onCreate={create}
                        />
                      ))}
                    </div>
                  ))}
                </m.div>
              </div>
            </div>
          </div>

          <DragOverlay
            dropAnimation={reduceMotion ? null : { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            {/* dnd-kit measures this outer box: keep it untransformed; the lift animates one level down. */}
            {activeItem ? (
              <div className="cursor-grabbing">
                <m.div
                  initial={{ scale: 1, rotate: 0 }}
                  animate={reduceMotion ? { scale: 1, rotate: 0 } : { scale: 1.03, rotate: 1 }}
                  transition={MOTION.spring}
                  className={chipClassName(activeItem, density, "shadow-pop")}
                >
                  <CalendarChipContent item={activeItem} today={today} density={density} />
                </m.div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Phones: an agenda list grouped by day. */}
      <Agenda days={agendaDays} byDate={byDate} today={today} onCreate={create} periodKey={range.start} />

      <CalendarLegend className="mt-4" />
    </div>
  );
}

/* --------------------------------- Cells --------------------------------- */

interface DayCellProps {
  date: string;
  items: CalendarEntry[];
  view: CalendarViewMode;
  today: string;
  inMonth: boolean;
  dragging: boolean;
  onCreate: (date: string) => void;
}

function DayCell({ date, items, view, today, inMonth, dragging, onCreate }: DayCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayDroppableId(date), data: { date } });
  const isToday = date === today;
  const month = view === "month";
  const density: ChipDensity = month ? "compact" : "comfortable";
  const overflow = month && items.length > MONTH_MAX_CHIPS;
  const visible = overflow ? items.slice(0, MONTH_MAX_CHIPS - 1) : items;
  const label = `${longDayLabel(date)}${isToday ? ", today" : ""}, ${pluralize(items.length, "item")}`;

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={label}
      className={cn(
        "group/day relative flex min-w-0 flex-col gap-1 p-1.5 transition-[background-color,box-shadow] duration-(--dur-2)",
        month ? "min-h-[7.75rem]" : "min-h-[26rem]",
        !inMonth ? "bg-surface-2/50" : isWeekendISO(date) && "bg-surface-2/25",
        isToday && "shadow-[inset_0_0_0_1.5px_color-mix(in_oklch,var(--accent)_55%,transparent)]",
        isOver && dragging && "bg-accent-soft/70 shadow-[inset_0_0_0_1.5px_var(--accent)]",
      )}
    >
      <div className="flex items-center justify-between gap-1">
        {month ? (
          <span
            aria-current={isToday ? "date" : undefined}
            className={cn(
              "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums",
              isToday ? "bg-accent text-accent-fg" : inMonth ? "text-fg" : "text-fg-subtle",
            )}
          >
            {date.endsWith("-01") ? `${monthShort(date)} ${dayOfMonth(date)}` : dayOfMonth(date)}
          </span>
        ) : (
          <span aria-current={isToday ? "date" : undefined} className="px-1 text-[11px] font-medium text-accent">
            {isToday ? "Today" : null}
          </span>
        )}
        <AddButton date={date} onCreate={onCreate} hidden={dragging} />
      </div>

      {visible.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-1">
          {visible.map((item) => (
            <li key={item.id} className="min-w-0">
              <CellItem item={item} today={today} density={density} />
            </li>
          ))}
        </ul>
      ) : null}

      {overflow ? <MoreItems date={date} items={items} hiddenCount={items.length - visible.length} today={today} onCreate={onCreate} /> : null}

      {/* The empty rest of the day: a click opens quick create (the + button is the keyboard path). */}
      <div aria-hidden className="min-h-3 flex-1 cursor-cell" onClick={() => !dragging && onCreate(date)} />
    </div>
  );
}

function AddButton({ date, onCreate, hidden }: { date: string; onCreate: (date: string) => void; hidden: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onCreate(date)}
      aria-label={`New task due ${longDayLabel(date)}`}
      title="New task on this day"
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-fg-subtle outline-none",
        "transition-[opacity,background-color,color] duration-(--dur-2) hover:bg-surface-2 hover:text-fg",
        "focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring",
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-2",
        hidden ? "pointer-events-none opacity-0" : "opacity-0 group-hover/day:opacity-100 pointer-coarse:opacity-100",
      )}
    >
      <Plus aria-hidden className="size-3.5" />
    </button>
  );
}

function CellItem({ item, today, density }: { item: CalendarEntry; today: string; density: ChipDensity }) {
  if (item.kind === "task") return <DraggableTaskChip item={item} today={today} density={density} />;
  return (
    <CalendarItemLink item={item} today={today} className={chipClassName(item, density)}>
      <CalendarChipContent item={item} today={today} density={density} />
    </CalendarItemLink>
  );
}

function DraggableTaskChip({ item, today, density }: { item: CalendarTaskEntry; today: string; density: ChipDensity }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
    data: { date: item.date },
    // Keep link semantics (Enter opens the task); dnd-kit's default "button" role would hide them.
    attributes: { role: "link", roleDescription: "draggable task" },
  });
  return (
    <CalendarItemLink
      ref={setNodeRef}
      item={item}
      today={today}
      {...attributes}
      {...listeners}
      className={chipClassName(item, density, cn("cursor-grab touch-manipulation", isDragging && "opacity-40"))}
    >
      <CalendarChipContent item={item} today={today} density={density} />
    </CalendarItemLink>
  );
}

interface MoreItemsProps {
  date: string;
  items: CalendarEntry[];
  hiddenCount: number;
  today: string;
  onCreate: (date: string) => void;
}

/** "+N more": every item of the day in a popover (links; drag from the week view or edit the due date). */
function MoreItems({ date, items, hiddenCount, today, onCreate }: MoreItemsProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Show all ${items.length} items on ${longDayLabel(date)}`}
          className={cn(
            "relative self-start rounded-full px-2 py-0.5 text-[11px] font-medium text-fg-muted outline-none tabular-nums",
            "transition-colors duration-(--dur-2) hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring",
            "data-[state=open]:bg-surface-2 data-[state=open]:text-fg pointer-coarse:after:absolute pointer-coarse:after:-inset-2",
          )}
        >
          +{hiddenCount} more
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="mb-2 px-1 text-sm font-semibold text-fg">{longDayLabel(date)}</p>
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id} className="min-w-0">
              <CalendarItemLink
                item={item}
                today={today}
                onClick={() => setOpen(false)}
                className={chipClassName(item, "comfortable")}
              >
                <CalendarChipContent item={item} today={today} density="comfortable" />
              </CalendarItemLink>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start"
          onClick={() => {
            setOpen(false);
            onCreate(date);
          }}
        >
          <Plus aria-hidden />
          New task on this day
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/* --------------------------------- Agenda -------------------------------- */

interface AgendaProps {
  days: string[];
  byDate: Map<string, CalendarEntry[]>;
  today: string;
  onCreate: (date: string) => void;
  /** Changes with the period, so each period's list gets its own first-mount reveal. */
  periodKey: string;
}

/** Below `sm`: days that have items (and today) as a list; no drag, the drawer's due date reschedules. */
function Agenda({ days, byDate, today, onCreate, periodKey }: AgendaProps) {
  const shown = days.filter((date) => (byDate.get(date)?.length ?? 0) > 0 || date === today);
  const hasItems = shown.some((date) => (byDate.get(date)?.length ?? 0) > 0);

  return (
    <div className="sm:hidden">
      {!hasItems ? (
        <EmptyState
          icon={CalendarOff}
          title="Nothing scheduled in this period."
          description="Tasks, phase deadlines, gates and go-lives appear here on their dates."
          action={
            <Button variant="outline" onClick={() => onCreate(days.includes(today) ? today : days[0])}>
              <Plus aria-hidden />
              New task
            </Button>
          }
        />
      ) : (
        <Stagger key={periodKey} as="ol" className="flex flex-col gap-4">
          {shown.map((date) => {
            const dayItems = byDate.get(date) ?? [];
            const headingId = `agenda-${date}`;
            const isToday = date === today;
            return (
              <StaggerItem key={date} as="li">
                <section aria-labelledby={headingId}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <h3
                      id={headingId}
                      className={cn("text-sm font-semibold tabular-nums", isToday ? "text-accent" : "text-fg")}
                    >
                      {isToday ? `Today · ${shortDayLabel(date)}` : shortDayLabel(date)}
                    </h3>
                    <span className="text-xs tabular-nums text-fg-muted">{pluralize(dayItems.length, "item")}</span>
                    <button
                      type="button"
                      onClick={() => onCreate(date)}
                      aria-label={`New task due ${longDayLabel(date)}`}
                      className="relative ml-auto inline-flex size-8 items-center justify-center rounded-full text-fg-muted outline-none transition-colors duration-(--dur-2) hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-1"
                    >
                      <Plus aria-hidden className="size-4" />
                    </button>
                  </div>
                  {dayItems.length > 0 ? (
                    <ul className="flex flex-col gap-1.5">
                      {dayItems.map((item) => (
                        <li key={item.id} className="min-w-0">
                          <CalendarItemLink
                            item={item}
                            today={today}
                            className={chipClassName(item, "comfortable", "min-h-11 py-2 pl-4 pr-3")}
                          >
                            <CalendarChipContent item={item} today={today} density="comfortable" />
                          </CalendarItemLink>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-fg-muted">
                      Nothing scheduled today.
                    </p>
                  )}
                </section>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}

/* --------------------------------- Legend -------------------------------- */

/** Every kind with its icon and label (colour is never the only cue). */
export function CalendarLegend({ className }: { className?: string }) {
  return (
    <ul aria-label="Legend" className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted", className)}>
      {CALENDAR_CHIP_KIND_ORDER.map((kind) => {
        const config = CALENDAR_CHIP_KINDS[kind];
        const KindIcon = config.icon;
        return (
          <li key={kind} className="inline-flex items-center gap-1.5">
            <KindIcon aria-hidden className={cn("size-3.5", config.iconClass)} />
            {config.label}
          </li>
        );
      })}
    </ul>
  );
}

