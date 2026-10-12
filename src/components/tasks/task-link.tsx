"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { hrefWithTask } from "./task-helpers";

/** The current URL with `?task=<key>` (keeps the page's filters), for opening the task drawer. */
export function useTaskHref(): (key: string) => string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return (key: string) => hrefWithTask(pathname, search, key);
}

export interface TaskLinkProps {
  taskKey: string;
  children: ReactNode;
  className?: string;
  tabIndex?: number;
  "aria-label"?: string;
}

/** Opens the task drawer in place (no scroll jump); a new tab opens the same view with the drawer. */
export function TaskLink({ taskKey, children, className, tabIndex, "aria-label": ariaLabel }: TaskLinkProps) {
  const taskHref = useTaskHref();
  return (
    <Link
      href={taskHref(taskKey)}
      scroll={false}
      className={className}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      // The board owns drags: never start a native link drag.
      draggable={false}
    >
      {children}
    </Link>
  );
}
