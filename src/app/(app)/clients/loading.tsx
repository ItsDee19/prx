import { Skeleton } from "@/components/ui/skeleton";

/** Loading UI shaped like /clients: header, toolbar and the card grid. */
export default function ClientsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading clients" role="status">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-full rounded-full sm:w-32" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-5">
        <Skeleton className="h-9 w-full sm:w-64 xl:w-72" />
        <Skeleton className="h-9 flex-1 sm:w-40 sm:flex-none" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-36 sm:ml-auto" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 3xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="flex items-start gap-3">
              <Skeleton className="size-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="col-span-2 h-8" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading clients</span>
    </div>
  );
}
