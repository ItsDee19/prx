import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like the inbox: header, filter tabs, a toolbar and two day groups. */
export default function InboxLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading inbox"
      role="status"
      className="reveal-fade mx-auto w-full max-w-4xl [--reveal-delay:150ms] [--reveal-duration:200ms]"
    >
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="mb-5 flex gap-2">
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
      </div>
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>
      {[4, 3].map((rows, group) => (
        <div key={group} className="mt-6">
          <Skeleton className="mb-2 h-3 w-20" />
          <div className="space-y-1 rounded-2xl border border-border bg-surface p-2 shadow-card">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex items-start gap-3 px-2 py-2.5">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
