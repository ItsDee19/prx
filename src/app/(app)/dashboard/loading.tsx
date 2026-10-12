import { FULL_ROW_CLASS, TODAY_TILE_CLASS, closingTileClass } from "@/components/dashboard/bento-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TILE = "min-w-0 rounded-[20px] border border-border bg-surface shadow-card";

/** One-cell tiles after Today as most viewers (admins and project owners) see them: gates plus the five shared tiles. */
const SINGLE_TILES = 6;

function TileHeader() {
  return (
    <div className="flex items-start gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
      <Skeleton className="size-8 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-32 max-w-full" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </div>
    </div>
  );
}

function RowsTile({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn(TILE, className)}>
      <TileHeader />
      <div className="space-y-3 px-4 pb-5 sm:px-5">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex items-center gap-3">
            <Skeleton className="size-7 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Home skeleton: the same header, KPI strip and bento placement as the page
 * (health strip, 2 x 2 Today block, one-cell tiles, stretched activity tile),
 * fading in after 150ms so fast loads never flash it.
 */
export default function HomeLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading Home"
      role="status"
      className="reveal-fade [--reveal-delay:150ms] [--reveal-duration:200ms]"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-52 max-w-full" />
        </div>
        <Skeleton className="h-9 w-full rounded-full sm:w-36" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={cn(TILE, "p-4 sm:p-5")}>
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-4 w-24 max-w-full" />
              <Skeleton className="hidden size-8 rounded-xl sm:block" />
            </div>
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-28 max-w-full" />
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
        <div className={cn(TILE, FULL_ROW_CLASS)}>
          <TileHeader />
          <div className="space-y-3 px-4 pb-5 sm:px-5">
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-36 rounded-full" />
              ))}
            </div>
          </div>
        </div>
        <RowsTile rows={7} className={TODAY_TILE_CLASS} />
        {Array.from({ length: SINGLE_TILES }, (_, i) => (
          <RowsTile key={i} rows={3} />
        ))}
        <RowsTile rows={4} className={closingTileClass(SINGLE_TILES)} />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
