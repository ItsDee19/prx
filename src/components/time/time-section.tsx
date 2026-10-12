"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Plus, Square } from "lucide-react";
import { toast } from "sonner";
import {
  getRunningTimerAction,
  listTaskTimeEntriesAction,
  startTimerAction,
  stopTimerAction,
  undoStopTimerAction,
} from "@/actions/time";
import type { TaskDrawerSectionProps } from "@/components/tasks/drawer-sections";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatHours, formatMinutes } from "@/lib/duration";
import type { RunningTimer, TaskRef, TimeEntryWithMeta } from "@/lib/types";
import { cn, formatDate, percent } from "@/lib/utils";
import { ElapsedClock, RunningDot } from "./elapsed-clock";
import { LogTimeDialog } from "./log-time-dialog";
import { announceTimer, rememberTimerProject, subscribeTimer } from "./time-events";

/** Entries shown before "Show all". */
const COLLAPSED_ENTRIES = 5;

/**
 * Task drawer section (client; SPEC.md section 21.3, order 65): logged vs
 * estimate, Start / Stop timer on this task, Log time, and the entries
 * logged against the task.
 */
export function TaskTimeSection({ task, today, onChanged }: TaskDrawerSectionProps) {
  const [entries, setEntries] = useState<TimeEntryWithMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [instance, setInstance] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const taskRef: TaskRef = useMemo(
    () => ({
      id: task.id,
      number: task.number,
      key: task.key,
      title: task.title,
      status: task.status,
      project_id: task.project_id,
    }),
    [task.id, task.number, task.key, task.title, task.status, task.project_id],
  );

  const loadEntries = useCallback(async () => {
    try {
      const result = await listTaskTimeEntriesAction(task.id);
      if (result.ok) {
        setEntries(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Could not load the time entries.");
    }
  }, [task.id]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    let active = true;
    getRunningTimerAction()
      .then((result) => {
        if (active && result.ok) setTimer(result.data);
      })
      .catch(() => undefined);
    const unsubscribe = subscribeTimer(setTimer);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const runningHere = timer !== null && timer.task_id === task.id;

  async function start() {
    setBusy("start");
    try {
      const result = await startTimerAction({ project_id: task.project_id, task_id: task.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      rememberTimerProject(task.project_id);
      const switched = timer !== null;
      setTimer(result.data);
      announceTimer(result.data);
      toast.success(switched ? `Switched to ${task.key}. The previous timer was logged.` : `Timer started on ${task.key}.`);
      if (switched) {
        void loadEntries();
        onChanged();
      }
    } catch {
      toast.error("Could not start the timer.");
    } finally {
      setBusy(null);
    }
  }

  async function stop() {
    setBusy("stop");
    try {
      const result = await stopTimerAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTimer(null);
      announceTimer(null);
      if (result.data) {
        const timerId = result.data.timer_id;
        toast.success(`Logged ${formatMinutes(result.data.entry.minutes)} on ${task.key}.`, {
          action: {
            label: "Undo",
            onClick: () => {
              void undoStopTimerAction(timerId).then((undo) => {
                if (!undo.ok) {
                  toast.error(undo.error);
                  return;
                }
                setTimer(undo.data);
                announceTimer(undo.data);
                void loadEntries();
                onChanged();
              });
            },
          },
        });
      }
      void loadEntries();
      onChanged();
    } catch {
      toast.error("Could not stop the timer.");
    } finally {
      setBusy(null);
    }
  }

  const estimate = task.estimate_minutes ?? 0;
  const ratio = estimate > 0 ? percent(task.logged_minutes, estimate) : null;
  const shown = entries ? (expanded ? entries : entries.slice(0, COLLAPSED_ENTRIES)) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          <span className="font-mono font-semibold tabular-nums text-fg">{formatHours(task.logged_minutes)}</span>
          {estimate > 0 ? (
            <span className="tabular-nums">
              {" "}
              of {formatHours(estimate)} estimated
              {ratio !== null && ratio > 100 ? (
                <span className="font-medium text-danger"> · {formatHours(task.logged_minutes - estimate)} over</span>
              ) : null}
            </span>
          ) : (
            " logged"
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {runningHere && timer ? (
            <Button size="sm" variant="secondary" onClick={() => void stop()} loading={busy === "stop"}>
              <Square aria-hidden className="fill-current" />
              Stop
              <ElapsedClock startedAt={timer.started_at} className="text-xs text-fg-muted" />
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void start()} loading={busy === "start"}>
              <Play aria-hidden />
              {timer ? "Switch timer here" : "Start timer"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setInstance((value) => value + 1);
              setLogOpen(true);
            }}
          >
            <Plus aria-hidden />
            Log time
          </Button>
        </div>
      </div>

      {estimate > 0 && ratio !== null ? (
        <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-surface-2">
          <span
            className={cn(
              "progress-fill block h-full w-full rounded-full",
              ratio > 100 ? "bg-danger" : ratio >= 90 ? "bg-warning" : "bg-success",
            )}
            style={{ transform: `scaleX(${Math.min(100, ratio) / 100})` }}
          />
        </span>
      ) : null}

      {runningHere ? (
        <p className="flex items-center gap-2 text-xs text-success">
          <RunningDot />
          Your timer is running on this task.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : entries === null ? (
        <div className="space-y-2" aria-hidden>
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-4/5 rounded-xl" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-fg-subtle">No time logged on this task yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {shown.map((entry) => (
              <li key={entry.id} className="flex min-w-0 items-center gap-2.5 px-3 py-2 text-sm">
                <UserAvatar user={entry.user} size="xs" />
                <span className="min-w-0 flex-1 truncate text-fg">
                  {entry.user.name}
                  {entry.note ? <span className="text-fg-muted"> · {entry.note}</span> : null}
                </span>
                <time dateTime={entry.entry_date} className="shrink-0 text-xs tabular-nums text-fg-muted">
                  {entry.entry_date === today ? "Today" : formatDate(entry.entry_date, { month: "short", day: "numeric" })}
                </time>
                <span className="w-14 shrink-0 text-right font-mono text-sm tabular-nums text-fg">
                  {formatMinutes(entry.minutes)}
                </span>
              </li>
            ))}
          </ul>
          {entries.length > COLLAPSED_ENTRIES ? (
            <Button variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "Show fewer" : `Show all ${entries.length}`}
            </Button>
          ) : null}
        </>
      )}

      <LogTimeDialog
        key={instance}
        open={logOpen}
        onOpenChange={setLogOpen}
        projects={[task.project]}
        defaultProjectId={task.project_id}
        defaultTaskId={task.id}
        defaultTask={taskRef}
        today={today}
        onSaved={() => {
          void loadEntries();
          onChanged();
        }}
      />
    </div>
  );
}
