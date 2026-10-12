"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CopyPlus, Plus, Table2, X } from "lucide-react";
import { toast } from "sonner";
import { setTimesheetCellAction } from "@/actions/time";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Spinner } from "@/components/ui/spinner";
import { MAX_ENTRY_MINUTES } from "@/lib/constants";
import { formatMinutesClock, parseDuration } from "@/lib/duration";
import type { ProjectSummary, TaskRef, TimesheetRow, TimesheetWeek } from "@/lib/types";
import { cn, formatDate, percent } from "@/lib/utils";
import { isWeekendISO } from "@/lib/workspace-time";
import { ProjectSelect, projectOptionLabel } from "./project-select";
import { TaskPicker } from "./task-picker";

type RowRef = Pick<TimesheetRow, "key" | "project" | "task">;

export interface TimesheetGridProps {
  week: TimesheetWeek;
  /** Rows of the week before (for "Copy last week's rows"). */
  previousRows: RowRef[];
  /** Projects for "Add row". */
  projects: ProjectSummary[];
  /** Whose sheet this is; differs from the viewer only for admins. */
  userId: string;
  viewerId: string;
  /** Workspace today (highlighted column). */
  today: string;
  /** The person's weekly capacity in hours. */
  capacityHours: number;
}

type CellKey = string;

function cellKey(rowKey: string, day: number): CellKey {
  return `${rowKey}|${day}`;
}

function rowKeyOf(projectId: string, taskId: string | null): string {
  return `${projectId}:${taskId ?? ""}`;
}

function valuesFromWeek(week: TimesheetWeek): Record<CellKey, number> {
  const values: Record<CellKey, number> = {};
  for (const row of week.rows) {
    row.minutes.forEach((minutes, day) => {
      if (minutes > 0) values[cellKey(row.key, day)] = minutes;
    });
  }
  return values;
}

function weekSignature(week: TimesheetWeek): string {
  return `${week.user_id}:${week.week_start}:${week.rows.map((row) => `${row.key}=${row.minutes.join(",")}`).join(";")}`;
}

function cellText(minutes: number | undefined): string {
  return minutes && minutes > 0 ? formatMinutesClock(minutes) : "";
}

function hours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Weekly timesheet (Monday..Sunday in the workspace timezone). Every cell is
 * an input that accepts "1h 30m", "1.5" or "90m" and saves on Enter or blur
 * (Escape reverts); arrow keys move between cells. Totals per row, per day
 * and for the week tick in Geist Mono. The grid scrolls sideways inside its
 * own container on phones, with the row labels pinned.
 */
export function TimesheetGrid({
  week,
  previousRows,
  projects,
  userId,
  viewerId,
  today,
  capacityHours,
}: TimesheetGridProps) {
  const [values, setValues] = useState<Record<CellKey, number>>(() => valuesFromWeek(week));
  const [extraRows, setExtraRows] = useState<RowRef[]>([]);
  const [drafts, setDraftsState] = useState<Record<CellKey, string>>({});
  /** Synchronous mirror of `drafts`: Enter/Escape and the blur that follows must not commit twice. */
  const draftsRef = useRef<Record<CellKey, string>>({});
  const [invalid, setInvalid] = useState<Record<CellKey, boolean>>({});
  const [saving, setSaving] = useState<Record<CellKey, boolean>>({});
  const [seen, setSeen] = useState(() => weekSignature(week));
  const pending = useRef(new Map<CellKey, number>());
  const sequence = useRef(0);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const valuesRef = useRef(values);
  valuesRef.current = values;

  function setDraft(key: CellKey, text: string) {
    draftsRef.current = { ...draftsRef.current, [key]: text };
    setDraftsState(draftsRef.current);
  }

  function clearDraft(key: CellKey) {
    if (!(key in draftsRef.current)) return;
    const next = { ...draftsRef.current };
    delete next[key];
    draftsRef.current = next;
    setDraftsState(next);
  }

  // A fresh server render (after each autosave revalidates) is the truth, except for
  // cells whose save is still in flight.
  const signature = weekSignature(week);
  if (signature !== seen) {
    setSeen(signature);
    const next = valuesFromWeek(week);
    for (const key of pending.current.keys()) {
      if (values[key] !== undefined) next[key] = values[key];
      else delete next[key];
    }
    setValues(next);
    setExtraRows((rows) => rows.filter((row) => !week.rows.some((serverRow) => serverRow.key === row.key)));
  }

  const rows = useMemo<RowRef[]>(() => {
    const serverKeys = new Set(week.rows.map((row) => row.key));
    return [...week.rows, ...extraRows.filter((row) => !serverKeys.has(row.key))];
  }, [week.rows, extraRows]);

  const rowTotals = rows.map((row) => week.days.reduce((sum, _, day) => sum + (values[cellKey(row.key, day)] ?? 0), 0));
  const dayTotals = week.days.map((_, day) => rows.reduce((sum, row) => sum + (values[cellKey(row.key, day)] ?? 0), 0));
  const weekTotal = dayTotals.reduce((sum, value) => sum + value, 0);
  const capacityMinutes = capacityHours * 60;
  const forSomeoneElse = userId !== viewerId;

  function focusCell(rowIndex: number, day: number) {
    const target = inputs.current.get(`${rowIndex}:${day}`);
    if (target) {
      target.focus();
      target.select();
    }
  }

  async function save(row: RowRef, day: number, minutes: number) {
    const key = cellKey(row.key, day);
    const previous = valuesRef.current[key] ?? 0;
    if (previous === minutes) return;
    const eager = { ...valuesRef.current };
    if (minutes > 0) eager[key] = minutes;
    else delete eager[key];
    valuesRef.current = eager;
    const seq = ++sequence.current;
    pending.current.set(key, seq);
    setValues((current) => {
      const next = { ...current };
      if (minutes > 0) next[key] = minutes;
      else delete next[key];
      return next;
    });
    setSaving((current) => ({ ...current, [key]: true }));
    try {
      const result = await setTimesheetCellAction(
        { project_id: row.project.id, task_id: row.task?.id ?? null, entry_date: week.days[day], minutes },
        forSomeoneElse ? userId : undefined,
      );
      if (!result.ok) {
        toast.error(result.error);
        if (pending.current.get(key) === seq) {
          setValues((current) => {
            const next = { ...current };
            if (previous > 0) next[key] = previous;
            else delete next[key];
            return next;
          });
        }
      }
    } catch {
      toast.error("Could not save the timesheet. Check your connection.");
      if (pending.current.get(key) === seq) {
        setValues((current) => ({ ...current, [key]: previous }));
      }
    } finally {
      if (pending.current.get(key) === seq) {
        pending.current.delete(key);
        setSaving((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
    }
  }

  /** Parses the draft; returns false (and flags the cell) when it is not a duration. */
  function commit(row: RowRef, day: number): boolean {
    const key = cellKey(row.key, day);
    const draft = draftsRef.current[key];
    if (draft === undefined) return true;
    const text = draft.trim();
    const minutes = text === "" ? 0 : parseDuration(text);
    if (minutes === null || minutes > MAX_ENTRY_MINUTES) {
      setInvalid((current) => ({ ...current, [key]: true }));
      toast.error(minutes === null ? "Use 1h 30m, 1.5 or 90m." : `A day holds at most ${MAX_ENTRY_MINUTES / 60} hours.`);
      return false;
    }
    setInvalid((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    clearDraft(key);
    void save(row, day, minutes);
    return true;
  }

  function revert(row: RowRef, day: number) {
    const key = cellKey(row.key, day);
    clearDraft(key);
    setInvalid((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, row: RowRef, rowIndex: number, day: number) {
    const input = event.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
    const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    switch (event.key) {
      case "Enter":
        event.preventDefault();
        if (commit(row, day)) focusCell(Math.min(rows.length - 1, rowIndex + (event.shiftKey ? -1 : 1)), day);
        break;
      case "Escape":
        event.preventDefault();
        revert(row, day);
        input.blur();
        break;
      case "ArrowDown":
        event.preventDefault();
        if (rowIndex < rows.length - 1 && commit(row, day)) focusCell(rowIndex + 1, day);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (rowIndex > 0 && commit(row, day)) focusCell(rowIndex - 1, day);
        break;
      case "ArrowLeft":
        if ((atStart || allSelected) && day > 0) {
          event.preventDefault();
          if (commit(row, day)) focusCell(rowIndex, day - 1);
        }
        break;
      case "ArrowRight":
        if ((atEnd || allSelected) && day < 6) {
          event.preventDefault();
          if (commit(row, day)) focusCell(rowIndex, day + 1);
        }
        break;
      default:
        break;
    }
  }

  function addRow(row: RowRef) {
    if (rows.some((existing) => existing.key === row.key)) {
      const index = rows.findIndex((existing) => existing.key === row.key);
      focusCell(index, 0);
      toast.info("That row is already on the sheet.");
      return;
    }
    setExtraRows((current) => [...current, row]);
  }

  const copyable = previousRows.filter((row) => !rows.some((existing) => existing.key === row.key));

  function copyLastWeek() {
    if (copyable.length === 0) return;
    setExtraRows((current) => [...current, ...copyable]);
    toast.success(`Added ${copyable.length} ${copyable.length === 1 ? "row" : "rows"} from last week.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProgressRing
            value={percent(weekTotal, capacityMinutes)}
            size={44}
            tone={weekTotal > capacityMinutes && capacityMinutes > 0 ? "warning" : "accent"}
            showValue
            label="Logged hours against weekly capacity"
          />
          <div>
            <p className="font-mono text-lg font-semibold leading-6 tabular-nums text-fg">
              <NumberTicker value={hours(weekTotal)} format={{ maximumFractionDigits: 2 }} suffix="h" />
            </p>
            <p className="text-xs text-fg-muted">of {capacityHours}h weekly capacity</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={copyLastWeek} disabled={copyable.length === 0}>
          <CopyPlus aria-hidden />
          Copy last week&apos;s rows
          {copyable.length > 0 ? <span className="tabular-nums text-fg-muted">({copyable.length})</span> : null}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Table2}
          title="Nothing on this week's sheet yet."
          description="Add a project or task row below, or copy last week's rows."
          className="rounded-2xl border border-dashed border-border"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="relative overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <caption className="sr-only">
                Timesheet for the week of {formatDate(week.week_start)}. Type durations such as 1h 30m, 1.5 or 90m.
              </caption>
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-xs font-medium text-fg-muted">
                  <th scope="col" className="sticky left-0 z-10 w-40 bg-surface-2 px-3 py-2 text-left font-medium sm:w-60">
                    Project and task
                  </th>
                  {week.days.map((day) => {
                    const isToday = day === today;
                    return (
                      <th
                        key={day}
                        scope="col"
                        className={cn(
                          "w-[4.75rem] px-1 py-2 text-center font-medium",
                          isWeekendISO(day) && "bg-surface-2",
                          isToday && "text-accent",
                        )}
                      >
                        <span className="block">{formatDate(day, { weekday: "short" })}</span>
                        <span className={cn("block tabular-nums", isToday ? "font-semibold" : "text-fg-subtle")}>
                          {formatDate(day, { month: "short", day: "numeric" })}
                        </span>
                        {isToday ? <span className="sr-only"> (today)</span> : null}
                      </th>
                    );
                  })}
                  <th scope="col" className="w-20 px-3 py-2 text-right font-medium">
                    Total
                  </th>
                  <th scope="col" className="w-10 px-1 py-2">
                    <span className="sr-only">Remove row</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, rowIndex) => {
                  const label = row.task ? `${row.task.key} ${row.task.title}` : `${row.project.name}, no task`;
                  const isServerRow = week.rows.some((serverRow) => serverRow.key === row.key);
                  const removable = !isServerRow && rowTotals[rowIndex] === 0;
                  return (
                    <tr key={row.key} className="group/row">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 w-40 bg-surface px-3 py-1.5 text-left font-normal group-hover/row:bg-surface-2 sm:w-60"
                      >
                        <span className="block truncate text-sm font-medium text-fg" title={projectOptionLabel(row.project)}>
                          {projectOptionLabel(row.project)}
                        </span>
                        {row.task ? (
                          <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-fg-muted" title={row.task.title}>
                            <span className="shrink-0 font-mono">{row.task.key}</span>
                            <span className="truncate">{row.task.title}</span>
                          </span>
                        ) : (
                          <span className="block text-xs text-fg-subtle">No task</span>
                        )}
                      </th>
                      {week.days.map((day, dayIndex) => {
                        const key = cellKey(row.key, dayIndex);
                        const draft = drafts[key];
                        const isInvalid = invalid[key] === true;
                        return (
                          <td
                            key={day}
                            className={cn(
                              "relative px-1 py-1.5",
                              isWeekendISO(day) && "bg-surface-2/50",
                              day === today && "bg-accent-soft/40",
                            )}
                          >
                            <input
                              ref={(element) => {
                                const id = `${rowIndex}:${dayIndex}`;
                                if (element) inputs.current.set(id, element);
                                else inputs.current.delete(id);
                              }}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              spellCheck={false}
                              aria-label={`${label}, ${formatDate(day, { weekday: "long", month: "long", day: "numeric" })}`}
                              aria-invalid={isInvalid || undefined}
                              value={draft ?? cellText(values[key])}
                              placeholder="·"
                              onFocus={(event) => {
                                const input = event.currentTarget;
                                if (draftsRef.current[key] === undefined) setDraft(key, cellText(values[key]));
                                requestAnimationFrame(() => input.select());
                              }}
                              onChange={(event) => {
                                const text = event.target.value;
                                setDraft(key, text);
                                if (isInvalid) {
                                  setInvalid((current) => {
                                    const next = { ...current };
                                    delete next[key];
                                    return next;
                                  });
                                }
                              }}
                              onBlur={() => {
                                commit(row, dayIndex);
                              }}
                              onKeyDown={(event) => handleKeyDown(event, row, rowIndex, dayIndex)}
                              className={cn(
                                "h-9 w-full min-w-0 rounded-[10px] border border-transparent bg-transparent px-1.5 text-center font-mono text-base tabular-nums text-fg sm:text-sm",
                                "placeholder:text-fg-subtle/60 outline-none transition-[border-color,background-color,box-shadow] duration-(--dur-2) ease-out-quart",
                                "hover:border-input-border hover:bg-surface focus-visible:border-ring focus-visible:bg-surface focus-visible:ring-[3px] focus-visible:ring-ring/25",
                                "aria-invalid:border-danger aria-invalid:ring-[3px] aria-invalid:ring-danger/25",
                              )}
                            />
                            {saving[key] ? (
                              <Spinner size="sm" className="pointer-events-none absolute right-1.5 top-1.5 text-fg-subtle" />
                            ) : null}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right font-mono text-sm font-semibold tabular-nums text-fg">
                        <NumberTicker value={hours(rowTotals[rowIndex])} format={{ maximumFractionDigits: 2 }} suffix="h" />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        {removable ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Remove row ${label}`}
                            onClick={() => setExtraRows((current) => current.filter((item) => item.key !== row.key))}
                          >
                            <X />
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-surface-2/60 text-sm">
                  <th scope="row" className="sticky left-0 z-10 bg-surface-2 px-3 py-2.5 text-left text-xs font-medium text-fg-muted">
                    Day total
                  </th>
                  {dayTotals.map((total, day) => (
                    <td
                      key={week.days[day]}
                      className={cn(
                        "px-1 py-2.5 text-center font-mono tabular-nums",
                        total > 0 ? "font-semibold text-fg" : "text-fg-subtle",
                        week.days[day] === today && "text-accent",
                      )}
                    >
                      <NumberTicker value={hours(total)} format={{ maximumFractionDigits: 2 }} suffix="h" />
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-fg">
                    <NumberTicker value={hours(weekTotal)} format={{ maximumFractionDigits: 2 }} suffix="h" />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <AddRowBar projects={projects} onAdd={addRow} />

      <p className="text-xs text-fg-muted">
        Cells save as you leave them. Timer and manual entries count toward the cell total; lowering a cell below them
        keeps those entries.
      </p>
    </div>
  );
}

function AddRowBar({ projects, onAdd }: { projects: ProjectSummary[]; onAdd: (row: RowRef) => void }) {
  const [projectId, setProjectId] = useState("");
  const [task, setTask] = useState<TaskRef | null>(null);
  const project = projects.find((item) => item.id === projectId) ?? null;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border p-3 sm:flex-row sm:items-center">
      <span className="text-sm font-medium text-fg sm:w-24 sm:shrink-0">Add a row</span>
      <ProjectSelect
        projects={projects}
        value={projectId}
        onChange={(next) => {
          setProjectId(next);
          setTask(null);
        }}
        placeholder="Choose a project"
        aria-label="Project for the new row"
        className="sm:w-64"
      />
      <div className="min-w-0 sm:w-72">
        <TaskPicker projectId={projectId || null} value={task} onChange={setTask} aria-label="Task for the new row" />
      </div>
      <Button
        variant="secondary"
        disabled={!project}
        onClick={() => {
          if (!project) return;
          onAdd({ key: rowKeyOf(project.id, task?.id ?? null), project, task });
          setTask(null);
        }}
      >
        <Plus aria-hidden />
        Add row
      </Button>
    </div>
  );
}
