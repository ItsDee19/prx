"use client";

import { useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { updateTaskStatusAction } from "@/actions/tasks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TASK_STATUS_CONFIG, TASK_STATUS_ORDER } from "@/lib/constants";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TaskStatusIcon } from "./task-status";

export interface TaskStatusMenuProps {
  taskId: string;
  status: TaskStatus;
  /** A single focusable element (rendered with `asChild`). Defaults to the status icon button. */
  trigger?: ReactNode;
  /**
   * Take over the change (e.g. the board moves the card optimistically). When
   * omitted the menu calls updateTaskStatusAction itself, optimistically.
   */
  onSelect?: (status: TaskStatus) => void;
  /** Names the task in the trigger's accessible name, e.g. "PRX-12". */
  taskLabel?: string;
  align?: "start" | "center" | "end";
  className?: string;
}

/** Keeps clicks in the menu from reaching a surrounding card or row link. */
function stop(event: MouseEvent) {
  event.stopPropagation();
}

/** Status picker; the keyboard and touch alternative to dragging a card between columns. */
export function TaskStatusMenu({
  taskId,
  status,
  trigger,
  onSelect,
  taskLabel,
  align = "start",
  className,
}: TaskStatusMenuProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<TaskStatus | null>(null);
  const [synced, setSynced] = useState(status);
  if (synced !== status) {
    setSynced(status);
    setOptimistic(null);
  }
  const current = onSelect ? status : (optimistic ?? status);
  const config = TASK_STATUS_CONFIG[current];

  function choose(next: TaskStatus) {
    if (next === current) return;
    if (onSelect) {
      onSelect(next);
      return;
    }
    setOptimistic(next);
    startTransition(async () => {
      const result = await updateTaskStatusAction(taskId, next);
      if (!result.ok) {
        setOptimistic(null);
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.key} moved to ${TASK_STATUS_CONFIG[next].label}.`, { duration: 2500 });
      router.refresh();
    });
  }

  const name = `Status: ${config.label}. Change status${taskLabel ? ` of ${taskLabel}` : ""}`;

  return (
    <DropdownMenu>
      {/* The data attribute lets list keyboard navigation open this menu with "s". */}
      <DropdownMenuTrigger asChild data-task-status-trigger="">
        {trigger ?? (
          <button
            type="button"
            onClick={stop}
            onPointerDown={stop}
            aria-label={name}
            aria-busy={pending || undefined}
            className={cn(
              "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full outline-none",
              "transition-[transform,background-color] duration-(--dur-1) active:scale-90",
              "hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
              "pointer-coarse:after:absolute pointer-coarse:after:-inset-2",
              pending && "opacity-60",
              className,
            )}
          >
            <TaskStatusIcon status={current} />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[11rem]" onClick={stop}>
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {TASK_STATUS_ORDER.map((value) => {
          const option = TASK_STATUS_CONFIG[value];
          const selected = value === current;
          return (
            <DropdownMenuItem key={value} role="menuitemradio" aria-checked={selected} onSelect={() => choose(value)}>
              <TaskStatusIcon status={value} />
              <span className="flex-1">{option.label}</span>
              {selected ? <Check className="text-accent!" aria-hidden /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
