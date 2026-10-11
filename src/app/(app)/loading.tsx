import { Skeleton } from "@/components/ui/skeleton";

/** Route-level loading UI: mirrors the shape of a typical page (header, stat row, lists). */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Loading page" role="status">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, column) => (
          <div key={column} className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
            <div className="space-y-3 px-5 pb-5">
              {Array.from({ length: 4 }, (_, row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
