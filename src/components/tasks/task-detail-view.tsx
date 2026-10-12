"use client";

import { useId } from "react";
import Link from "next/link";
import type { TaskDetail, UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { visibleTaskDrawerSections, type TaskDrawerSectionEntry, type TaskDrawerSectionProps } from "./drawer-sections";
import { TaskTitleEditor } from "./task-title-editor";

export interface TaskDetailViewProps {
  task: TaskDetail;
  users: UserSummary[];
  viewerId: string;
  isAdmin: boolean;
  today: string;
  blobEnabled: boolean;
  onChanged: () => void;
  /** "drawer": one column with the title on top; "page": details beside the main column from lg. */
  variant: "drawer" | "page";
  className?: string;
}

function Section({ entry, props, first }: { entry: TaskDrawerSectionEntry; props: TaskDrawerSectionProps; first: boolean }) {
  const Component = entry.component;
  const headingId = `${useId()}-${entry.id}`;
  return (
    <section aria-labelledby={headingId} className={cn("min-w-0", !first && "border-t border-border pt-5")}>
      <h3 id={headingId} className={cn("mb-2.5 text-sm font-semibold text-fg", entry.srOnlyTitle && "sr-only")}>
        {entry.title}
      </h3>
      <Component {...props} />
    </section>
  );
}

/**
 * Everything about one task, rendered from the drawer sections registry.
 * Shared by the TaskDrawer and the /tasks/[key] page.
 */
export function TaskDetailView({
  task,
  users,
  viewerId,
  isAdmin,
  today,
  blobEnabled,
  onChanged,
  variant,
  className,
}: TaskDetailViewProps) {
  const sections = visibleTaskDrawerSections(task);
  const props: TaskDrawerSectionProps = { task, users, viewerId, isAdmin, today, blobEnabled, onChanged };

  if (variant === "page") {
    const side = sections.filter((entry) => entry.id === "properties");
    const main = sections.filter((entry) => entry.id !== "properties");
    return (
      <div className={cn("grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem] 3xl:grid-cols-[minmax(0,1fr)_26rem]", className)}>
        <aside className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5 lg:sticky lg:top-20 lg:order-last">
          {side.map((entry, index) => (
            <Section key={entry.id} entry={entry} props={props} first={index === 0} />
          ))}
        </aside>
        <div className="min-w-0 space-y-5 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-6">
          {main.map((entry, index) => (
            <Section key={entry.id} entry={entry} props={props} first={index === 0} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-w-0 space-y-5", className)}>
      <header className="space-y-1.5">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
          <Link
            href={`/projects/${task.project.id}?tab=tasks`}
            className="flex min-w-0 items-center gap-1.5 rounded outline-none hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-fg-subtle"
              style={task.project.color ? { backgroundColor: task.project.color } : undefined}
            />
            <span className="truncate">
              {task.project.client_code ? `${task.project.client_code} · ` : ""}
              {task.project.name}
            </span>
          </Link>
          {task.milestone ? (
            <>
              <span aria-hidden className="text-fg-subtle">
                ·
              </span>
              <span className="truncate">{task.milestone.name}</span>
            </>
          ) : null}
        </p>
        <h2 className="text-lg font-semibold leading-7 tracking-tight text-fg">
          <TaskTitleEditor task={task} onChanged={onChanged} />
        </h2>
      </header>
      {sections.map((entry, index) => (
        <Section key={entry.id} entry={entry} props={props} first={index === 0} />
      ))}
    </div>
  );
}
