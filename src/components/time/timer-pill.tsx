"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, Timer as TimerIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  discardTimerAction,
  getRunningTimerAction,
  startTimerAction,
  stopTimerAction,
  undoStopTimerAction,
} from "@/actions/time";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { formatMinutes } from "@/lib/duration";
import type { ProjectSummary, RunningTimer, StartTimerInput, TaskRef } from "@/lib/types";
import { cn, subscribeAppCommands } from "@/lib/utils";
import { ElapsedClock, RunningDot } from "./elapsed-clock";
import { projectOptionLabel } from "./project-select";
import { StartTimerForm } from "./start-timer-form";
import { announceTimer, projectIdFromPath, readLastTimerProject, rememberTimerProject, subscribeTimer } from "./time-events";

export interface TimerPillProps {
  initialTimer: RunningTimer | null;
  /** Projects offered by the start / switch pickers (open projects, by name). */
  projects: ProjectSummary[];
  className?: string;
}

type Busy = "start" | "stop" | "discard" | null;

/** Refresh from the server at most this often when the window regains focus. */
const FOCUS_REFRESH_MS = 5_000;

function signature(timer: RunningTimer | null): string {
  return timer ? `${timer.id}:${timer.started_at}:${timer.project_id}:${timer.task_id ?? ""}` : "none";
}

function timerLabel(timer: RunningTimer): string {
  return timer.task ? `${timer.task.key} ${timer.task.title}` : timer.project.name;
}

/**
 * Topbar timer. Idle: "Start timer" opens a popover with project, task and
 * note. Running: a pulsing dot and the live elapsed time (rendered only after
 * mount, so no hydration mismatch); the pill opens details with Switch task,
 * Stop and Discard, and the square button stops at once. Stopping logs the
 * entry and toasts with Undo. Handles the `toggle-timer` AppCommand, follows
 * the drawer's timer changes, and re-reads the server timer when the window
 * regains focus (timers survive reloads and other devices).
 */
export function TimerPill({ initialTimer, projects, className }: TimerPillProps) {
  const [timer, setTimer] = useState<RunningTimer | null>(initialTimer);
  const [seen, setSeen] = useState(signature(initialTimer));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(null);
  const timerRef = useRef(timer);
  const lastRefresh = useRef(0);

  // A fresh server render (after any revalidating action) wins.
  const incoming = signature(initialTimer);
  if (incoming !== seen) {
    setSeen(incoming);
    setTimer(initialTimer);
  }

  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefresh.current < FOCUS_REFRESH_MS) return;
    lastRefresh.current = now;
    try {
      const result = await getRunningTimerAction();
      if (result.ok) setTimer(result.data);
    } catch {
      // Offline or signed out: keep showing what we have.
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => subscribeTimer(setTimer), []);

  const openPopover = useCallback(() => {
    const fromPath = projectIdFromPath(window.location.pathname);
    setDefaultProjectId(fromPath ?? readLastTimerProject());
    setConfirmDiscard(false);
    setOpen(true);
  }, []);

  function handleOpenChange(next: boolean) {
    if (next) openPopover();
    else setOpen(false);
  }

  const undo = useCallback(async (timerId: string) => {
    try {
      const result = await undoStopTimerAction(timerId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTimer(result.data);
      announceTimer(result.data);
      toast.success("Timer resumed.");
    } catch {
      toast.error("Could not undo. The entry is still logged.");
    }
  }, []);

  const stop = useCallback(async () => {
    const current = timerRef.current;
    if (!current) return;
    setBusy("stop");
    try {
      const result = await stopTimerAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTimer(null);
      setOpen(false);
      announceTimer(null);
      if (result.data) {
        const { entry, timer_id } = result.data;
        toast.success(`Logged ${formatMinutes(entry.minutes)} on ${current.project.name}.`, {
          action: { label: "Undo", onClick: () => void undo(timer_id) },
        });
      }
    } catch {
      toast.error("Could not stop the timer.");
    } finally {
      setBusy(null);
    }
  }, [undo]);

  async function start(input: StartTimerInput, labels: { project: string; task: TaskRef | null }) {
    const previous = timerRef.current;
    setBusy("start");
    try {
      const result = await startTimerAction(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      rememberTimerProject(input.project_id);
      setTimer(result.data);
      setOpen(false);
      announceTimer(result.data);
      const target = labels.task ? `${labels.task.key} ${labels.task.title}` : labels.project;
      toast.success(previous ? `Switched to ${target}. The previous timer was logged.` : `Timer started on ${target}.`);
    } catch {
      toast.error("Could not start the timer.");
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    setBusy("discard");
    try {
      const result = await discardTimerAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setTimer(null);
      setOpen(false);
      announceTimer(null);
      toast.success("Timer discarded. No time was logged.");
    } catch {
      toast.error("Could not discard the timer.");
    } finally {
      setBusy(null);
      setConfirmDiscard(false);
    }
  }

  useEffect(
    () =>
      subscribeAppCommands((command) => {
        if (command.type !== "toggle-timer") return;
        if (timerRef.current) void stop();
        else openPopover();
      }),
    [stop, openPopover],
  );

  if (!timer) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label="Start timer"
            className={cn("size-9 px-0 text-fg-muted shadow-none hover:text-fg md:w-auto md:gap-2 md:px-3", className)}
          >
            <TimerIcon aria-hidden />
            <span className="hidden md:inline">Start timer</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <h2 className="mb-3 text-sm font-semibold text-fg">Start a timer</h2>
          <StartTimerForm
            projects={projects}
            defaultProjectId={defaultProjectId}
            submitLabel="Start timer"
            pending={busy === "start"}
            onSubmit={start}
          />
        </PopoverContent>
      </Popover>
    );
  }

  const label = timerLabel(timer);
  return (
    <div
      className={cn(
        "flex h-9 min-w-0 items-center rounded-full border border-success/35 bg-success/10 pl-1 pr-0.5 text-fg",
        "shadow-[0_0_0_3px_color-mix(in_oklch,var(--success)_10%,transparent)]",
        className,
      )}
    >
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Timer running on ${label}. Open timer`}
            className={cn(
              "flex h-8 min-w-0 items-center gap-2 rounded-full pl-2.5 pr-2 text-sm outline-none",
              "transition-colors duration-(--dur-2) hover:bg-success/10",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            )}
          >
            <RunningDot />
            <ElapsedClock startedAt={timer.started_at} className="text-[13px] font-medium" />
            <span className="hidden max-w-44 truncate text-xs text-fg-muted lg:block" aria-hidden>
              {timer.task ? timer.task.key : timer.project.name}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-success">
                <RunningDot />
                Running
              </span>
              <ElapsedClock startedAt={timer.started_at} className="text-2xl font-semibold leading-none text-fg" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-sm font-medium text-fg" title={projectOptionLabel(timer.project)}>
                {projectOptionLabel(timer.project)}
              </p>
              {timer.task ? (
                <p className="flex min-w-0 items-baseline gap-1.5 text-sm text-fg-muted">
                  <span className="shrink-0 font-mono text-xs">{timer.task.key}</span>
                  <span className="truncate" title={timer.task.title}>
                    {timer.task.title}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-fg-muted">No task</p>
              )}
              {timer.note ? <p className="pt-1 text-xs text-fg-muted [overflow-wrap:anywhere]">{timer.note}</p> : null}
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void stop()} loading={busy === "stop"}>
                <Square aria-hidden className="fill-current" />
                Stop and log
              </Button>
              <Button
                variant={confirmDiscard ? "danger" : "ghost"}
                onClick={() => void discard()}
                loading={busy === "discard"}
                aria-label={confirmDiscard ? "Confirm discard: no time is logged" : "Discard timer"}
              >
                <Trash2 aria-hidden />
                {confirmDiscard ? "Discard?" : null}
              </Button>
            </div>
          </div>
          <div className="p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Play aria-hidden className="size-3.5 text-fg-muted" />
              Switch task
            </h2>
            <StartTimerForm
              key={timer.id}
              projects={projects}
              defaultProjectId={timer.project_id}
              submitLabel="Switch"
              pending={busy === "start"}
              onSubmit={start}
            />
            <p className="mt-2 text-xs text-fg-muted">Switching logs the current timer first.</p>
          </div>
        </PopoverContent>
      </Popover>
      <Tooltip content="Stop timer">
        <button
          type="button"
          onClick={() => void stop()}
          disabled={busy === "stop"}
          aria-label="Stop timer and log time"
          className={cn(
            "relative flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted outline-none",
            "transition-[color,background-color,transform] duration-(--dur-1) hover:bg-danger/10 hover:text-danger active:scale-90",
            "focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            "pointer-coarse:after:absolute pointer-coarse:after:-inset-1",
          )}
        >
          <Square aria-hidden className="size-3.5 fill-current" />
        </button>
      </Tooltip>
    </div>
  );
}
