import Link from "next/link";
import { Activity as ActivityIcon } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { TimeAgo } from "@/components/ui/time-ago";
import type { Activity } from "@/lib/types";

/** Timeline of a client's activity (its projects plus client edits), newest first. */
export function ClientActivity({ activity }: { activity: Activity[] }) {
  if (activity.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <span className="flex size-9 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
          <ActivityIcon className="size-4" aria-hidden />
        </span>
        <p className="text-sm text-fg-muted">No activity yet.</p>
      </div>
    );
  }
  return (
    <ol className="space-y-3.5">
      {activity.map((entry) => (
        <li key={entry.id} className="flex min-w-0 gap-2.5">
          {entry.actor ? (
            <UserAvatar user={entry.actor} size="sm" className="mt-0.5" />
          ) : (
            <span aria-hidden className="mt-0.5 size-6 shrink-0 rounded-full bg-surface-2" />
          )}
          <div className="min-w-0 flex-1 text-sm leading-5">
            <p className="text-fg-muted [overflow-wrap:anywhere]">
              <span className="font-medium text-fg">{entry.actor?.name ?? "Someone"}</span> {entry.message}
              {entry.project_id && entry.project_name ? (
                <>
                  {" "}
                  on{" "}
                  <Link
                    href={`/projects/${entry.project_id}`}
                    className="rounded font-medium text-fg outline-none transition-colors duration-150 hover:text-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {entry.project_name}
                  </Link>
                </>
              ) : null}
            </p>
            <TimeAgo date={entry.created_at} className="text-xs text-fg-subtle" />
          </div>
        </li>
      ))}
    </ol>
  );
}
