import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like the timeline: header, toolbar, legend strip and a chart with client groups. */
export default function TimelineLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading timeline"
      role="status"
      className="reveal-fade [--reveal-delay:150ms] [--reveal-duration:200ms]"
    >
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-60 max-w-full" />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-5">
        <Skeleton className="h-9 w-full rounded-full sm:w-56" />
        <Skeleton className="h-9 w-36 rounded-[10px]" />
        <Skeleton className="h-9 w-36 rounded-[10px]" />
        <Skeleton className="h-9 w-28 rounded-[10px]" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap gap-4 border-b border-border px-4 py-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-4 w-20 rounded-full" />
          ))}
        </div>
        <div className="hidden h-[52px] border-b border-border sm:flex">
          <div className="w-[140px] shrink-0 border-r border-border md:w-[240px]" />
          <div className="flex flex-1 items-center gap-6 px-4">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-3 w-16 rounded-full" />
            ))}
          </div>
        </div>
        {[3, 2].map((count, group) => (
          <div key={group}>
            <div className="flex h-9 items-center gap-2 border-b border-border bg-surface-2 px-4">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-4 w-32 rounded-full" />
            </div>
            {Array.from({ length: count }, (_, row) => (
              <div key={row} className="flex h-11 items-center border-b border-border/60">
                <div className="flex w-full items-center gap-2 px-4 sm:w-[140px] sm:shrink-0 sm:border-r sm:border-border/60 md:w-[240px]">
                  <Skeleton className="size-2 rounded-full" />
                  <Skeleton className="h-4 w-full max-w-40 rounded-full" />
                </div>
                <div className="relative hidden h-full flex-1 sm:block">
                  <div
                    className="absolute top-1/2 h-5 -translate-y-1/2"
                    style={{ left: `${8 + ((row + group * 2) % 4) * 9}%`, width: `${26 + ((row * 7 + group * 5) % 4) * 8}%` }}
                  >
                    <Skeleton className="size-full rounded-[7px]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
