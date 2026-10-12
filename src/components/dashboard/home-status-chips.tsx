"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { formatElapsed } from "@/lib/duration";
import { cn } from "@/lib/utils";

const CHIP_CLASS = cn(
  "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-surface px-2.5 text-xs font-medium text-fg ring-1 ring-inset ring-border",
  "transition-colors duration-(--dur-2) hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "pointer-coarse:h-9",
);

export interface RunningTimerChipProps {
  /** ISO start of the running timer. */
  startedAt: string;
  projectName: string;
  /** "PRX-12" when the timer is on a task. */
  taskKey: string | null;
}

/**
 * "Timer running" chip with the live elapsed time. The clock only starts
 * after mount (no server/client mismatch); it ticks once a second while the
 * tab is visible.
 */
export function RunningTimerChip({ startedAt, projectName, taskKey }: RunningTimerChipProps) {
  const [elapsed, setElapsed] = useState<string | null>(null);

  useEffect(() => {
    const start = Date.parse(startedAt);
    if (Number.isNaN(start)) return;
    let timer = 0;
    const tick = () => setElapsed(formatElapsed(Date.now() - start));
    const run = () => {
      window.clearInterval(timer);
      if (document.hidden) return;
      tick();
      timer = window.setInterval(tick, 1000);
    };
    run();
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
    };
  }, [startedAt]);

  return (
    <Link href="/time" className={CHIP_CLASS} title={`Timer running on ${taskKey ? `${taskKey} · ` : ""}${projectName}`}>
      <span aria-hidden className="relative flex size-2 shrink-0">
        <span className="absolute inset-0 animate-pulse-soft rounded-full bg-success" />
        <span className="relative size-2 rounded-full bg-success" />
      </span>
      <span className="shrink-0">Timer running</span>
      {elapsed ? <span className="shrink-0 font-mono tabular-nums text-fg-muted">{elapsed}</span> : null}
      <span className="min-w-0 truncate text-fg-muted">
        <span className="sr-only">on </span>
        {taskKey ? `${taskKey} · ` : ""}
        {projectName}
      </span>
    </Link>
  );
}

/** Unread inbox count as a chip (hidden by the caller when zero). */
export function UnreadChip({ count }: { count: number }) {
  return (
    <Link href="/inbox?tab=unread" className={CHIP_CLASS}>
      <Inbox aria-hidden className="size-3.5 shrink-0 text-accent" />
      <span className="tabular-nums">{count > 99 ? "99+" : count}</span>
      <span>{count === 1 ? "unread notification" : "unread notifications"}</span>
    </Link>
  );
}
