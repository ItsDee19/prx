import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function PageHeader({ title, description, actions, breadcrumbs, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
            {breadcrumbs.map((crumb, index) => {
              const last = index === breadcrumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  <li className="flex min-w-0 items-center">
                    {crumb.href && !last ? (
                      <Link
                        href={crumb.href}
                        className="max-w-48 truncate rounded px-0.5 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        aria-current={last ? "page" : undefined}
                        className={cn("max-w-48 truncate px-0.5", last && "font-medium text-fg")}
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
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-7 tracking-tight text-fg sm:text-2xl sm:leading-8">
            {title}
          </h1>
          {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
