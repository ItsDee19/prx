import { Skeleton } from "@/components/ui/skeleton";

const CARD = "min-w-0 rounded-2xl border border-border bg-surface shadow-card";

/**
 * Route-level loading UI: mirrors the shape of a typical page (header, stat
 * row, lists) with shimmering placeholders. It fades in after a short delay so
 * fast navigations never flash it.
 */
export default function AppLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading page"
      role="status"
      className="reveal-fade [--reveal-delay:150ms] [--reveal-duration:200ms]"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        {/* PageHeader actions are a full-width row on phones. */}
        <Skeleton className="h-9 w-full rounded-full sm:w-32" />
      </div>

      {/* Same grid as the dashboard metrics: 2-up from the smallest phones, 4-up from lg. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`${CARD} p-4 sm:p-5`}>
            <Skeleton className="h-4 w-24 max-w-full" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-32 max-w-full" />
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, column) => (
          <div key={column} className={CARD}>
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
