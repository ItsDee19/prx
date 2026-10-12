import { Skeleton } from "@/components/ui/skeleton";

const CARD = "min-w-0 rounded-2xl border border-border bg-surface shadow-card";

/** Shaped like the task page: breadcrumbs, title, then the main column and the details card. */
export default function TaskLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading task"
      role="status"
      className="reveal-fade [--reveal-delay:150ms] [--reveal-duration:200ms]"
    >
      <div className="mb-6 space-y-3">
        <Skeleton className="h-3 w-48 rounded-full" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-8 w-full max-w-lg" />
            <Skeleton className="h-5 w-40 rounded-full" />
          </div>
          <Skeleton className="h-9 w-full rounded-full sm:w-32" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] 3xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className={`${CARD} space-y-3 p-4 sm:p-5 lg:order-last`}>
          {Array.from({ length: 7 }, (_, row) => (
            <div key={row} className="grid grid-cols-[6.5rem_1fr] items-center gap-3">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-7 w-36 rounded-full" />
            </div>
          ))}
        </div>
        <div className={`${CARD} space-y-5 p-4 sm:p-6`}>
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-20 w-full rounded-[12px]" />
          <Skeleton className="h-4 w-24 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full rounded-[10px]" />
            <Skeleton className="h-8 w-5/6 rounded-[10px]" />
            <Skeleton className="h-8 w-2/3 rounded-[10px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
