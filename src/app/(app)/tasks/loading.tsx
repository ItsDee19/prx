import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like My tasks: header, toolbar pills and two due-date groups of rows. */
export default function TasksLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading tasks"
      role="status"
      className="reveal-fade [--reveal-delay:150ms] [--reveal-duration:200ms]"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <Skeleton className="h-9 w-full rounded-full sm:w-32" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-56 rounded-[10px]" />
        <Skeleton className="h-8 w-16 rounded-[10px]" />
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>
      {[4, 3].map((rows, group) => (
        <div key={group} className="mt-5">
          <Skeleton className="mb-2 h-5 w-28 rounded-full" />
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-5 shrink-0 rounded-full" />
                <Skeleton className="h-4 min-w-0 flex-1 rounded-full sm:max-w-md" />
                <Skeleton className="hidden h-4 w-28 rounded-full md:block" />
                <Skeleton className="h-4 w-14 rounded-full" />
                <Skeleton className="size-6 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
