import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageReadyMark } from "./page-ready-mark";

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  className?: string;
}

/**
 * Crumbs truncate: ancestors to a share of the screen on phones and a fixed cap
 * from `sm` up; the current page (also shown in full as the h1) may use the rest
 * of the row, wrapping onto its own line before it truncates.
 */
const CRUMB_CLASS = "block truncate px-0.5";
const ANCESTOR_CRUMB_CLASS = "max-w-[40vw] sm:max-w-48";
const CURRENT_CRUMB_CLASS = "max-w-full sm:max-w-xs";

/**
 * Page title row. Phones: title and description, then the actions as a
 * full-width row underneath (text buttons share the width; icon-only buttons
 * keep their size). From `sm` up the actions sit to the right of the title.
 */
export function PageHeader({ title, description, actions, breadcrumbs, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      <PageReadyMark />
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-fg-muted">
            {breadcrumbs.map((crumb, index) => {
              const last = index === breadcrumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  <li className="flex min-w-0 items-center">
                    {crumb.href && !last ? (
                      <Link
                        href={crumb.href}
                        className={cn(
                          CRUMB_CLASS,
                          ANCESTOR_CRUMB_CLASS,
                          "rounded transition-colors duration-(--dur-2) hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        aria-current={last ? "page" : undefined}
                        className={cn(
                          CRUMB_CLASS,
                          last ? cn(CURRENT_CRUMB_CLASS, "font-medium text-fg") : ANCESTOR_CRUMB_CLASS,
                        )}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </li>
                  {!last ? (
                    <li aria-hidden className="flex items-center text-fg-subtle">
                      <ChevronRight className="size-3.5" />
                    </li>
                  ) : null}
                </Fragment>
              );
            })}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          {/* Page title: 20/28 on phones, 24/30 from sm, semibold, -0.02em. */}
          <h1 className="text-xl font-semibold leading-7 tracking-[-0.02em] text-fg [overflow-wrap:anywhere] sm:text-2xl sm:leading-[1.875rem]">
            {title}
          </h1>
          {/* A div, not a <p>: callers pass rich content (badges, selects) here. */}
          {description ? (
            <div className="mt-1 text-sm text-fg-muted [overflow-wrap:anywhere]">{description}</div>
          ) : null}
        </div>
        {actions ? (
          <div
            className={cn(
              "flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end",
              "max-sm:*:grow max-sm:[&>[data-size=icon]]:grow-0",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
