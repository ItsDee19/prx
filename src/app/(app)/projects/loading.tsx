import { Skeleton } from "@/components/ui/skeleton";

/** Route-level loading UI shaped like the projects page: header, toolbar, board columns. */
export default function ProjectsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading projects" role="status">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full sm:w-64" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="ml-auto h-9 w-36" />
        <Skeleton className="h-9 w-16" />
      </div>

      <div className="-mx-4 flex gap-4 overflow-hidden px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {Array.from({ length: 5 }, (_, column) => (
          <div key={column} className="w-72 shrink-0 rounded-lg border border-border bg-surface-2/60 p-2">
            <div className="flex items-center gap-2 px-1 pb-2 pt-1">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="ml-auto h-5 w-6 rounded-full" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: column % 2 === 0 ? 3 : 2 }, (_, card) => (
                <div key={card} className="rounded-lg border border-border bg-surface p-3.5">
                  <Skeleton className="h-4 w-3/4" />
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
