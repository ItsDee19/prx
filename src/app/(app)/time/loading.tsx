import { Skeleton } from "@/components/ui/skeleton";

/** Route-level loading UI shaped like /time: header, tabs, week navigation and the timesheet grid. */
export default function TimeLoading() {
  return (
    <div aria-busy="true" aria-label="Loading time" role="status">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-full rounded-full sm:w-32" />
      </div>
      <div className="mb-6 flex gap-2">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <Skeleton className="h-12 w-full rounded-none" />
        {Array.from({ length: 4 }, (_, row) => (
          <div key={row} className="flex items-center gap-3 border-t border-border px-3 py-3">
            <Skeleton className="h-8 w-36 shrink-0 sm:w-56" />
            <div className="grid flex-1 grid-cols-4 gap-2 sm:grid-cols-8">
              {Array.from({ length: 8 }, (_, cell) => (
                <Skeleton key={cell} className={cell >= 4 ? "hidden h-8 sm:block" : "h-8"} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
