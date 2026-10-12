"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { updateProjectStatusAction } from "@/actions/projects";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_CONFIG, STATUS_ORDER } from "@/lib/constants";
import type { ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface StatusSelectProps {
  projectId: string;
  status: ProjectStatus;
  size?: "sm" | "md";
  className?: string;
}

/** Keeps clicks inside the menu from reaching a surrounding link or row handler. */
function stop(event: MouseEvent) {
  event.stopPropagation();
}

/**
 * A status badge that opens a menu of all statuses. The change is applied
 * optimistically and reverted (with a toast) if the server rejects it.
 */
export function StatusSelect({ projectId, status, size = "sm", className }: StatusSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<ProjectStatus | null>(null);
  const [syncedStatus, setSyncedStatus] = useState(status);

  // Once the server state catches up (router.refresh), drop the optimistic override.
  if (syncedStatus !== status) {
    setSyncedStatus(status);
    setOptimistic(null);
  }

  const current = optimistic ?? status;
  const config = STATUS_CONFIG[current];

  function choose(next: ProjectStatus) {
    if (next === current) return;
    const previous = current;
    setOptimistic(next);
    startTransition(async () => {
      const result = await updateProjectStatusAction(projectId, next);
      if (!result.ok) {
        setOptimistic(previous === status ? null : previous);
        toast.error(result.error);
        return;
      }
      toast.success(`Status set to ${STATUS_CONFIG[next].label}`);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={stop}
          aria-label={`Status: ${config.label}. Change status`}
          aria-busy={pending || undefined}
          className={cn(
            "relative inline-flex shrink-0 rounded-md outline-none transition-opacity duration-150",
            // Touch screens: grow the hit area to ~40px tall without changing the badge's look.
            "pointer-coarse:before:absolute pointer-coarse:before:-inset-x-1 pointer-coarse:before:-inset-y-2.5",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
            "data-[state=open]:opacity-80 hover:opacity-80",
            pending && "opacity-60",
            className,
          )}
        >
          <Badge
            tone={config.tone}
            dot
            dotClassName={config.dotClass}
            className={cn("cursor-pointer pr-1", size === "md" && "h-7 px-2 pr-1.5 text-[13px]")}
          >
            {config.label}
            <ChevronDown aria-hidden className={cn("shrink-0 opacity-70", size === "md" ? "size-4" : "size-3.5")} />
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]" onClick={stop}>
        {STATUS_ORDER.map((value) => {
          const option = STATUS_CONFIG[value];
          const selected = value === current;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => choose(value)}
              aria-checked={selected}
              role="menuitemradio"
            >
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", option.dotClass)} />
              <span className="flex-1">{option.label}</span>
              {selected ? <Check className="text-accent!" aria-hidden /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
