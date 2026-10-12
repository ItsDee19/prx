import { db } from "@/lib/db";
import { OPEN_RISK_STATUSES } from "@/lib/constants";
import type { ProjectTabCounts } from "@/lib/types";

/**
 * Row counts the project page loads once for its tab badges and tab
 * visibility predicates, in one round trip (scalar subqueries over the v2
 * tables). Counts cover the project itself, not its sub-projects.
 */
export async function getProjectTabCounts(projectId: string): Promise<ProjectTabCounts> {
  const row = await db.queryOne<ProjectTabCounts>(
    `SELECT
       (SELECT COUNT(*)::int FROM tasks t
         WHERE t.project_id = $1 AND t.status <> 'cancelled') AS tasks,
       (SELECT COUNT(*)::int FROM milestones m WHERE m.project_id = $1) AS milestones,
       (SELECT COUNT(*)::int FROM status_updates s WHERE s.project_id = $1) AS status_updates,
       (SELECT COUNT(*)::int FROM risks r
         WHERE r.project_id = $1 AND r.status = ANY($2::text[])) AS open_risks,
       (SELECT COUNT(*)::int FROM eval_runs e WHERE e.project_id = $1) AS eval_runs,
       (SELECT COUNT(*)::int FROM data_batches b WHERE b.project_id = $1) AS batches,
       (SELECT COUNT(*)::int FROM time_entries te WHERE te.project_id = $1) AS time_entries,
       (SELECT COUNT(*)::int FROM attachments a WHERE a.project_id = $1) AS attachments`,
    [projectId, OPEN_RISK_STATUSES],
  );
  return {
    tasks: row?.tasks ?? 0,
    milestones: row?.milestones ?? 0,
    status_updates: row?.status_updates ?? 0,
    open_risks: row?.open_risks ?? 0,
    eval_runs: row?.eval_runs ?? 0,
    batches: row?.batches ?? 0,
    time_entries: row?.time_entries ?? 0,
    attachments: row?.attachments ?? 0,
  };
}
