import { Skeleton } from "@/components/ui/skeleton";
import { ProjectTabSkeleton } from "@/components/projects/detail/project-tab-skeleton";

/**
 * Mirrors the project page while it loads: breadcrumbs and header (title, status row,
 * actions), the tab bar, then the Overview grid (see components/projects/detail/overview/grid.ts),
 * placed exactly like the real page at every breakpoint.
 */
export default function ProjectLoading() {
  return (
    <div aria-busy="true" aria-label="Loading project" role="status" className="min-w-0">
      <div className="mb-4 sm:mb-5">
        <Skeleton className="mb-3 h-3 w-56 max-w-full" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="size-3.5 shrink-0 rounded-full" />
              <Skeleton className="h-7 w-64 max-w-full" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-28" />
            </div>
          </div>
          {/* Phones: one full-width row (the first action grows); from sm: compact, right. */}
          <div className="flex w-full gap-2 sm:w-auto">
            <Skeleton className="h-9 flex-1 sm:w-36 sm:flex-none" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="size-9" />
          </div>
        </div>
      </div>
      {/* Tab bar: one line, scrolls on phones. */}
      <div className="mb-4 flex gap-2 overflow-hidden border-b border-border pb-2.5 sm:mb-6">
        <Skeleton className="h-5 w-24 shrink-0" />
        <Skeleton className="h-5 w-20 shrink-0" />
        <Skeleton className="h-5 w-20 shrink-0" />
      </div>
      <ProjectTabSkeleton tab="overview" announce={false} />
      <span className="sr-only">Loading</span>
    </div>
  );
}
