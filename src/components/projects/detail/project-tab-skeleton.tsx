import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectTabId } from "@/lib/types";
import { OVERVIEW_GRID, OVERVIEW_MAIN, OVERVIEW_SIDE } from "./overview/grid";

const CARD = "rounded-2xl border border-border bg-surface shadow-card";

function CardHead({ width }: { width: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-5">
      <Skeleton className={`h-4 ${width}`} />
    </div>
  );
}

/** Mirrors the overview cards (description, phases, sub-projects, comments | details) in their grid. */
function OverviewSkeleton() {
  return (
    <div className={OVERVIEW_GRID}>
      <div className={OVERVIEW_MAIN}>
        <div className={CARD}>
          <CardHead width="w-24" />
          <div className="max-w-[80ch] space-y-2 px-5 pb-5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <div className={CARD}>
          <CardHead width="w-20" />
          <div className="flex gap-4 overflow-hidden px-5 pb-5">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="min-w-[9.5rem] flex-1 space-y-2 p-2">
                <Skeleton className="size-7 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
        <div className={CARD}>
          <CardHead width="w-28" />
          <div className="space-y-4 px-5 pb-5">
            {Array.from({ length: 3 }, (_, row) => (
              <div key={row} className="flex items-start gap-2">
                <Skeleton className="size-5 shrink-0 rounded" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4 max-w-72" />
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={CARD}>
          <CardHead width="w-24" />
          <div className="space-y-4 px-5 pb-5">
            <div className="flex gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="min-w-0 max-w-[80ch] flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40 max-w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
      <div className={OVERVIEW_SIDE}>
        <div className={CARD}>
          <CardHead width="w-16" />
          {/* Same column switch as DetailsPanel: two columns from md until the side column (xl). */}
          <div className="grid grid-cols-1 gap-y-4 px-5 pb-5 md:grid-cols-2 md:gap-x-8 xl:grid-cols-1">
            {Array.from({ length: 10 }, (_, row) => (
              <div
                key={row}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[6.5rem_minmax(0,1fr)]"
              >
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-32 max-w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className={CARD}>
      <CardHead width="w-20" />
      <div className="space-y-4 px-5 pb-5">
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} className="flex gap-3">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-full max-w-md" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Placeholder for a project tab while its server data streams in (also the
 * body of the route's loading.tsx, which announces itself: pass
 * `announce={false}` there). The overview mirrors its card grid; every other
 * tab gets a list-shaped card.
 */
export function ProjectTabSkeleton({ tab, announce = true }: { tab: ProjectTabId; announce?: boolean }) {
  if (!announce) return tab === "overview" ? <OverviewSkeleton /> : <ListSkeleton />;
  return (
    <div aria-busy="true" role="status" aria-label="Loading">
      {tab === "overview" ? <OverviewSkeleton /> : <ListSkeleton />}
      <span className="sr-only">Loading</span>
    </div>
  );
}
