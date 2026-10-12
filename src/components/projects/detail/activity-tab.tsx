import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProjectActivity } from "@/lib/data/activity";
import { getWorkspaceTimezone } from "@/lib/data/app-settings";
import { pluralize } from "@/lib/utils";
import { ActivityFeed } from "./activity-feed";
import type { ProjectTabProps } from "./tabs/types";

/** Entries the Activity tab shows (newest first). */
export const ACTIVITY_TAB_LIMIT = 100;

/**
 * The Activity tab: everything logged on this project (not its sub-projects),
 * newest first, grouped by day in the workspace timezone. Task entries link
 * to the task drawer.
 */
export async function ActivityTab({ project, today }: ProjectTabProps) {
  const [items, timeZone] = await Promise.all([
    listProjectActivity(project.id, ACTIVITY_TAB_LIMIT),
    getWorkspaceTimezone(),
  ]);

  return (
    <section aria-labelledby="project-activity-heading" className="min-w-0">
      <Card>
        <CardHeader className="flex-wrap items-baseline gap-y-1">
          <CardTitle id="project-activity-heading">Activity</CardTitle>
          {items.length > 0 ? (
            <span className="text-xs tabular-nums text-fg-subtle">
              {items.length >= ACTIVITY_TAB_LIMIT
                ? `Latest ${ACTIVITY_TAB_LIMIT} entries`
                : pluralize(items.length, "entry", "entries")}
            </span>
          ) : null}
        </CardHeader>
        <CardContent>
          <ActivityFeed items={items} projectId={project.id} groupByDay={{ today, timeZone }} />
        </CardContent>
      </Card>
    </section>
  );
}
