import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like /reports: header, tabs, filters, KPI tiles and a grid of chart cards. */
export default function ReportsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading reports"
      role="status"
      className="reveal-fade [--reveal-delay:150ms] [--reveal-duration:200ms]"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-full rounded-full sm:w-36" />
      </div>
      <div className="mb-4 flex gap-2 sm:mb-5">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-24 rounded-full" />
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2 sm:mb-5">
        <Skeleton className="h-9 w-full rounded-[10px] sm:w-40" />
        <Skeleton className="h-9 w-72 max-w-full rounded-[10px]" />
        <Skeleton className="h-9 w-44 rounded-[10px]" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-[20px] border border-border bg-surface p-4 shadow-card sm:p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-8 w-20" />
            <Skeleton className="mt-2 h-3 w-28 max-w-full" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-2 3xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-56 max-w-full" />
            <Skeleton className="mt-5 h-56 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
