import { BOARD_COLUMN_CLASS, BOARD_TRACK_CLASS } from "@/components/projects/board-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Route-level loading UI shaped like the projects page at every width:
 * header, toolbar (search + Filters + view toggle on phones; status, client,
 * service line, health, labels and More inline from md), the phone column
 * chips and the board columns, which share the board's width rules.
 */
export default function ProjectsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading projects" role="status">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        {/* PageHeader actions are a full-width row on phones. */}
        <Skeleton className="h-9 w-full rounded-full sm:w-36" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-5">
        <Skeleton className="h-9 w-full md:w-60 xl:w-72" />
        <Skeleton className="h-9 w-24 md:hidden" />
        <Skeleton className="hidden h-9 w-20 md:block" />
        <Skeleton className="hidden h-9 w-32 md:block" />
        <Skeleton className="hidden h-9 w-32 md:block" />
        <Skeleton className="hidden h-9 w-24 md:block" />
        <Skeleton className="hidden h-9 w-24 md:block" />
        <Skeleton className="hidden h-9 w-20 md:block" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="hidden h-9 w-40 md:block" />
          <Skeleton className="h-9 w-16" />
        </div>
      </div>

      <div className="-mx-4 mb-3 flex gap-1.5 overflow-hidden px-4 py-0.5 sm:-mx-6 sm:px-6 md:hidden">
        {Array.from({ length: 5 }, (_, chip) => (
          <Skeleton key={chip} className="h-8 w-24 shrink-0 rounded-full" />
        ))}
      </div>

      <div className={cn(BOARD_TRACK_CLASS, "overflow-hidden")}>
        {Array.from({ length: 5 }, (_, column) => (
          <div key={column} className={cn(BOARD_COLUMN_CLASS, "rounded-2xl border border-border bg-surface-2/60 p-2")}>
            <div className="flex items-center gap-2 px-1 pb-2 pt-1">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="ml-auto h-5 w-6 rounded-full" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: column % 2 === 0 ? 3 : 2 }, (_, card) => (
                <div key={card} className="rounded-2xl border border-border bg-surface p-3.5 shadow-card">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="mt-2 flex items-center gap-1.5">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="size-5 rounded-md" />
                  </div>
                  <Skeleton className="mt-2 h-3 w-full" />
                  <Skeleton className="mt-1 h-3 w-5/6" />
                  <div className="mt-3 flex items-center gap-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="ml-auto size-5 rounded-full" />
                  </div>
                  <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading projects</span>
    </div>
  );
}
