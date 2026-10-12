"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTimeEntryAction } from "@/actions/time";
import { Stagger, StaggerItem } from "@/components/motion";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { TIME_ENTRY_SOURCE_CONFIG } from "@/lib/constants";
import { formatMinutes } from "@/lib/duration";
import type { ProjectSummary, TimeEntryWithMeta } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { LogTimeDialog } from "./log-time-dialog";
import { projectOptionLabel } from "./project-select";

export interface TimeEntryListProps {
  entries: TimeEntryWithMeta[];
  /** Options for the edit dialog's project picker. */
  projects: ProjectSummary[];
  viewerId: string;
  isAdmin: boolean;
  today: string;
  showUser?: boolean;
  showProject?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

interface DayGroup {
  date: string;
  minutes: number;
  entries: TimeEntryWithMeta[];
}

function groupByDay(entries: TimeEntryWithMeta[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.entry_date) {
      last.entries.push(entry);
      last.minutes += entry.minutes;
    } else {
      groups.push({ date: entry.entry_date, minutes: entry.minutes, entries: [entry] });
    }
  }
  return groups;
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  return formatDate(date, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

/**
 * Time entries grouped by day (newest first) with day totals in Geist Mono.
 * The entry owner and admins can edit (LogTimeDialog) and delete each row.
 */
export function TimeEntryList({
  entries,
  projects,
  viewerId,
  isAdmin,
  today,
  showUser = true,
  showProject = true,
  emptyTitle = "No time logged yet.",
  emptyDescription = "Start a timer or log time and it shows up here.",
  className,
}: TimeEntryListProps) {
  const groups = useMemo(() => groupByDay(entries), [entries]);
  const [editing, setEditing] = useState<TimeEntryWithMeta | null>(null);
  const [deleting, setDeleting] = useState<TimeEntryWithMeta | null>(null);
  const [pending, setPending] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setPending(true);
    try {
      const result = await deleteTimeEntryAction(deleting.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${formatMinutes(deleting.minutes)} on ${deleting.project.name}.`);
      setDeleting(null);
    } catch {
      toast.error("Could not delete the entry.");
    } finally {
      setPending(false);
    }
  }

  if (entries.length === 0) {
    return <EmptyState icon={Clock} title={emptyTitle} description={emptyDescription} className={className} />;
  }

  return (
    <>
      <Stagger className={cn("space-y-4", className)}>
        {groups.map((group) => (
          <StaggerItem key={group.date} as="section">
            <h3 className="mb-1.5 flex items-baseline justify-between gap-3 px-1 text-xs font-medium text-fg-muted">
              <time dateTime={group.date}>{dayLabel(group.date, today)}</time>
              <span className="font-mono tabular-nums text-fg">{formatMinutes(group.minutes)}</span>
            </h3>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
              {group.entries.map((entry) => {
                const canEdit = entry.user_id === viewerId || isAdmin;
                const source = TIME_ENTRY_SOURCE_CONFIG[entry.source];
                return (
                  <li key={entry.id} className="flex min-w-0 items-start gap-3 px-4 py-3 transition-colors duration-(--dur-2) hover:bg-surface-2/40">
                    {showUser ? <UserAvatar user={entry.user} size="sm" className="mt-0.5" /> : null}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                        {showProject ? (
                          <Link
                            href={`/projects/${entry.project_id}?tab=time`}
                            className="min-w-0 truncate font-medium text-fg outline-none hover:text-accent focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {projectOptionLabel(entry.project)}
                          </Link>
                        ) : null}
                        {entry.task ? (
                          <Link
                            href={`/tasks/${entry.task.key}`}
                            className="inline-flex min-w-0 items-baseline gap-1.5 text-fg-muted outline-none hover:text-accent focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="shrink-0 font-mono text-xs">{entry.task.key}</span>
                            <span className="truncate">{entry.task.title}</span>
                          </Link>
                        ) : !showProject ? (
                          <span className="text-fg-muted">No task</span>
                        ) : null}
                      </p>
                      {entry.note ? (
                        <p className="text-xs text-fg-muted [overflow-wrap:anywhere]">{entry.note}</p>
                      ) : null}
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-fg-muted">
                        {showUser ? <span>{entry.user.name}</span> : null}
                        {entry.milestone_name ? <span>{entry.milestone_name}</span> : null}
                        <span className="inline-flex items-center gap-1">
                          <Icon name={source.icon} aria-hidden className="size-3" />
                          {source.label}
                        </span>
                        {entry.billable ? (
                          <Badge tone="green">Billable</Badge>
                        ) : (
                          <Badge tone="neutral">Non-billable</Badge>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 pt-0.5 font-mono text-sm font-semibold tabular-nums text-fg">
                      {formatMinutes(entry.minutes)}
                    </span>
                    {canEdit ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="-my-1 -mr-2 size-8 shrink-0"
                            aria-label={`Actions for ${formatMinutes(entry.minutes)} on ${entry.project.name}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(entry)}>
                            <Pencil aria-hidden />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onSelect={() => setDeleting(entry)}>
                            <Trash2 aria-hidden />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </StaggerItem>
        ))}
      </Stagger>

      <LogTimeDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        projects={projects}
        today={today}
        entry={editing}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(null);
        }}
      >
        <DialogContent
          size="sm"
          title="Delete this time entry?"
          description={
            deleting
              ? `${formatMinutes(deleting.minutes)} on ${deleting.project.name}, ${formatDate(deleting.entry_date)}. This cannot be undone.`
              : undefined
          }
        >
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="danger" loading={pending} onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
