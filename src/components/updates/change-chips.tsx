import { CalendarClock, CircleCheck, Flag, ShieldAlert, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StatusUpdateChanges } from "@/lib/types";
import { cn, formatDate, pluralize } from "@/lib/utils";

interface Chip {
  key: string;
  icon: LucideIcon;
  label: string;
  tone: "neutral" | "good" | "warn";
}

/** The "changes since last update" as short labelled chips (shared by the composer and the feed). */
export function changeChips(changes: StatusUpdateChanges): Chip[] {
  const chips: Chip[] = [];
  if (changes.tasks_completed > 0) {
    chips.push({
      key: "tasks",
      icon: CircleCheck,
      label: `${pluralize(changes.tasks_completed, "task")} done`,
      tone: "good",
    });
  }
  changes.milestones_done.forEach((name, index) => {
    chips.push({ key: `milestone:${index}`, icon: Flag, label: `${name} completed`, tone: "good" });
  });
  if (changes.progress_from !== null && changes.progress_from !== changes.progress_to) {
    chips.push({
      key: "progress",
      icon: TrendingUp,
      label: `Progress ${changes.progress_from}% → ${changes.progress_to}%`,
      tone: changes.progress_to >= changes.progress_from ? "good" : "warn",
    });
  }
  if (changes.due_date_from && changes.due_date_to && changes.due_date_from !== changes.due_date_to) {
    chips.push({
      key: "due",
      icon: CalendarClock,
      label: `Due ${formatDate(changes.due_date_from, { month: "short", day: "numeric" })} → ${formatDate(changes.due_date_to, { month: "short", day: "numeric" })}`,
      tone: changes.due_date_to > changes.due_date_from ? "warn" : "neutral",
    });
  } else if (!changes.due_date_from && changes.due_date_to && changes.progress_from !== null) {
    chips.push({
      key: "due",
      icon: CalendarClock,
      label: `Due date set to ${formatDate(changes.due_date_to, { month: "short", day: "numeric" })}`,
      tone: "neutral",
    });
  }
  if (changes.risks_opened > 0) {
    chips.push({
      key: "risks",
      icon: ShieldAlert,
      label: pluralize(changes.risks_opened, "new RAID item"),
      tone: "warn",
    });
  }
  return chips;
}

const TONE: Record<Chip["tone"], string> = {
  neutral: "border-border bg-surface-2/60 text-fg-muted",
  good: "border-success/25 bg-success/8 text-fg",
  warn: "border-warning/30 bg-warning/10 text-fg",
};

const ICON_TONE: Record<Chip["tone"], string> = {
  neutral: "text-fg-subtle",
  good: "text-success",
  warn: "text-warning",
};

export interface ChangeChipsProps {
  changes: StatusUpdateChanges;
  /** Shown when nothing changed (omit to render nothing). */
  emptyLabel?: string;
  className?: string;
}

export function ChangeChips({ changes, emptyLabel, className }: ChangeChipsProps) {
  const chips = changeChips(changes);
  if (chips.length === 0) {
    return emptyLabel ? <p className={cn("text-xs text-fg-muted", className)}>{emptyLabel}</p> : null;
  }
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Changes since the previous update">
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <li
            key={chip.key}
            className={cn(
              "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums",
              TONE[chip.tone],
            )}
          >
            <Icon aria-hidden className={cn("size-3.5 shrink-0", ICON_TONE[chip.tone])} />
            <span className="truncate">{chip.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
