import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the project detail layout: breadcrumbs, header, main column cards and the side column. */
export default function ProjectLoading() {
  return (
    <div aria-busy="true" aria-label="Loading project" role="status">
      <div className="mb-6">
        <Skeleton className="mb-3 h-3 w-56 max-w-full" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="size-3.5 rounded-full" />
              <Skeleton className="h-7 w-64 max-w-full" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-28" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="size-9" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-surface">
            <div className="px-5 pb-3 pt-5">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-2 px-5 pb-5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between px-5 pb-3 pt-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="space-y-3 px-5 pb-5">
              {Array.from({ length: 4 }, (_, row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="size-5 rounded" />
                  <Skeleton className="size-2 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="hidden h-5 w-20 sm:block" />
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="hidden h-1.5 w-24 sm:block" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface">
            <div className="px-5 pb-3 pt-5">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-4 px-5 pb-5">
              {Array.from({ length: 2 }, (_, row) => (
                <div key={row} className="flex gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              ))}
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-surface">
            <div className="px-5 pb-3 pt-5">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="space-y-4 px-5 pb-5">
              {Array.from({ length: 7 }, (_, row) => (
                <div key={row} className="grid grid-cols-[6.5rem_1fr] items-center gap-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-32 max-w-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface">
            <div className="px-5 pb-3 pt-5">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="space-y-4 px-5 pb-5">
              {Array.from({ length: 5 }, (_, row) => (
                <div key={row} className="flex gap-3">
                  <Skeleton className="size-6 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
