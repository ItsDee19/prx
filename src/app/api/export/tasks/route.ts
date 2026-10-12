import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { exportTasksCsv } from "@/lib/data/reports";
import { PRIORITIES, TASK_STATUSES, type Priority, type TaskFilters, type TaskStatus } from "@/lib/types";
import { isDateOnly } from "@/lib/workspace-time";

export const dynamic = "force-dynamic";

const MAX_ID_LENGTH = 64;
const MAX_LIST = 50;

/** Every value of a repeated or comma-separated param, trimmed and de-duplicated. */
function listParam(search: URLSearchParams, key: string): string[] {
  const values = search
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= MAX_ID_LENGTH);
  return [...new Set(values)].slice(0, MAX_LIST);
}

function idParam(search: URLSearchParams, key: string): string | undefined {
  const value = search.get(key)?.trim();
  return value && value.length <= MAX_ID_LENGTH ? value : undefined;
}

/**
 * The TaskFilters in the query string: `project`, `client`, `assignee`
 * (`none` = unassigned), `milestone` (`none` = no phase), `status`,
 * `priority` and `label` (repeated or comma separated), `deliverable=1`,
 * `q`, `due_from`, `due_to`. Unknown values are ignored.
 */
function parseTaskExportFilters(search: URLSearchParams): TaskFilters {
  const filters: TaskFilters = { sort: "number" };
  const project = idParam(search, "project");
  if (project) filters.projectId = project;
  const client = idParam(search, "client");
  if (client) filters.clientId = client;
  const assignee = idParam(search, "assignee");
  if (assignee) filters.assigneeId = assignee === "none" ? null : assignee;
  const milestone = idParam(search, "milestone");
  if (milestone) filters.milestoneId = milestone === "none" ? null : milestone;

  const statuses = listParam(search, "status").filter((value): value is TaskStatus =>
    (TASK_STATUSES as readonly string[]).includes(value),
  );
  if (statuses.length > 0) filters.status = statuses;
  const priorities = listParam(search, "priority").filter((value): value is Priority =>
    (PRIORITIES as readonly string[]).includes(value),
  );
  if (priorities.length > 0) filters.priority = priorities;
  const labels = listParam(search, "label");
  if (labels.length > 0) filters.labelIds = labels;

  if (search.get("deliverable") === "1") filters.isDeliverable = true;
  const q = search.get("q")?.trim().slice(0, 100);
  if (q) filters.search = q;
  const dueFrom = search.get("due_from");
  if (isDateOnly(dueFrom)) filters.dueFrom = dueFrom;
  const dueTo = search.get("due_to");
  if (isDateOnly(dueTo)) filters.dueTo = dueTo;
  return filters;
}

/**
 * GET /api/export/tasks (SPEC.md section 19.2): tasks matching the
 * TaskFilters in the query string as CSV. The session is checked here; task
 * exports carry no commercial columns, and the client column is the client
 * code (confidential client names never appear).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export." }, { status: 401 });

  const filters = parseTaskExportFilters(new URL(request.url).searchParams);
  try {
    const [csv, today] = await Promise.all([exportTasksCsv(filters), getWorkspaceToday()]);
    return new NextResponse(`\uFEFF${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tasks-${today}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Tasks export failed", error);
    return NextResponse.json({ error: "The export failed. Try again." }, { status: 500 });
  }
}
