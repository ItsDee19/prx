import Link from "next/link";
import {
  Activity as ActivityIcon,
  CircleCheck,
  CircleDot,
  Flag,
  FolderPlus,
  Gavel,
  ListChecks,
  MessageSquare,
  Paperclip,
  Pencil,
  ShieldAlert,
  Trash2,
  UserPlus,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { UserAvatar } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/ui/time-ago";
import type { Activity, ActivityType } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { addDaysISO, dateInTimeZone } from "@/lib/workspace-time";

export interface ActivityFeedProps {
  items: Activity[];
  /** Project of the feed: task chips then open the task drawer on this project page. */
  projectId?: string;
  /** Groups entries under day headings (Today, Yesterday, Mon, Oct 5) in the workspace timezone. */
  groupByDay?: { today: string; timeZone: string };
}

/** Small glyph on the actor's avatar that says what kind of change it was. */
function iconFor(type: ActivityType): LucideIcon {
  if (type === "comment_added") return MessageSquare;
  if (type === "gate_requested" || type === "gate_decided") return Gavel;
  if (type.startsWith("milestone")) return Flag;
  if (type === "task_status_changed" || type === "deliverable_approved") return CircleCheck;
  if (type.startsWith("task")) return ListChecks;
  if (type === "member_added" || type === "member_removed") return UserPlus;
  if (type === "status_changed" || type === "progress_updated") return CircleDot;
  if (type === "subproject_created" || type === "project_created") return FolderPlus;
  if (type.startsWith("risk")) return ShieldAlert;
  if (type.startsWith("attachment")) return Paperclip;
  if (type.endsWith("_deleted")) return Trash2;
  return Pencil;
}

function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDaysISO(today, -1)) return "Yesterday";
  return formatDate(day, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  });
}

function Entry({ item, projectId }: { item: Activity; projectId?: string }) {
  const Glyph = iconFor(item.type);
  const taskHref = item.task_key
    ? projectId
      ? `/projects/${projectId}?tab=activity&task=${encodeURIComponent(item.task_key)}`
      : `/tasks/${encodeURIComponent(item.task_key)}`
    : null;
  return (
    <div className="relative flex gap-3">
      <span className="relative z-10 shrink-0 rounded-full ring-4 ring-surface">
        {item.actor ? (
          <UserAvatar user={item.actor} size="sm" />
        ) : (
          <span
            role="img"
            aria-label="Unknown user"
            className="flex size-6 items-center justify-center rounded-full bg-surface-2 text-fg-subtle"
          >
            <UserRound className="size-3.5" aria-hidden />
          </span>
        )}
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-surface text-fg-muted ring-1 ring-border"
        >
          <Glyph className="size-2.5" />
        </span>
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm leading-5 text-fg [overflow-wrap:anywhere]">
          <span className="font-medium">{item.actor?.name ?? "Someone"}</span>{" "}
          <span className="text-fg-muted">{item.message}</span>
          {taskHref && item.task_key ? (
            <>
              {" "}
              <Link
                href={taskHref}
                scroll={false}
                title={item.task_title ?? undefined}
                className={cn(
                  "inline-flex items-center rounded-md bg-surface-2 px-1.5 align-baseline font-mono text-[11px] leading-5 text-fg-muted",
                  "outline-none transition-colors duration-(--dur-2) hover:text-accent focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {item.task_key}
                {item.task_title ? <span className="sr-only">: {item.task_title}</span> : null}
              </Link>
            </>
          ) : null}
        </p>
        <TimeAgo date={item.created_at} className="mt-0.5 block text-xs text-fg-subtle" />
      </div>
    </div>
  );
}

const TIMELINE =
  "relative space-y-4 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-border";

/** Vertical timeline of a project's own activity (newest first). */
export function ActivityFeed({ items, projectId, groupByDay }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
          <ActivityIcon className="size-5" aria-hidden />
        </div>
        <p className="text-sm font-medium text-fg">No activity yet</p>
        <p className="mt-1 text-sm text-fg-muted">Changes to this project will show up here.</p>
      </div>
    );
  }

  if (!groupByDay) {
    return (
      <Stagger as="ol" className={TIMELINE}>
        {items.map((item) => (
          <StaggerItem key={item.id} as="li">
            <Entry item={item} projectId={projectId} />
          </StaggerItem>
        ))}
      </Stagger>
    );
  }

  const groups: { day: string; items: Activity[] }[] = [];
  for (const item of items) {
    const day = dateInTimeZone(item.created_at, groupByDay.timeZone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }

  return (
    <Stagger as="div" className="space-y-6">
      {groups.map((group) => (
        <StaggerItem key={group.day} as="section" className="min-w-0">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            <time dateTime={group.day}>{dayLabel(group.day, groupByDay.today)}</time>
          </h4>
          <ol className={TIMELINE}>
            {group.items.map((item) => (
              <li key={item.id}>
                <Entry item={item} projectId={projectId} />
              </li>
            ))}
          </ol>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
