import { db, newId, nowISO, type Queryable } from "@/lib/db";
import {
  CLOSED_TASK_STATUSES,
  DEFAULT_UPDATE_CADENCE_DAYS,
  NOTIFICATION_RETENTION_DAYS,
  OPEN_STATUSES,
  OPEN_TASK_STATUSES,
  TASK_STATUS_CONFIG,
  TUNING_ALERT_DAYS,
} from "@/lib/constants";
import type {
  AppNotification,
  BudgetPeriod,
  Comment,
  Milestone,
  NotificationFilters,
  NotificationType,
  NotifyInput,
  ProjectStatus,
  TaskRef,
  TaskWithMeta,
  UserSummary,
  WatchEntity,
} from "@/lib/types";
import {
  budgetPeriodRange,
  computeBudgetBurn,
  isUpdateDue,
  mentionsToPlainText,
  parseMentions,
  taskKey,
  truncate,
} from "@/lib/utils";
import { addDaysISO, diffDaysISO, isoWeekKey, tuningEndDate } from "@/lib/workspace-time";

/*
 * Notifications and watchers (SPEC §17.5, §23.2).
 *
 * - Every notification goes through notify()/notifyWatchers(): the actor is
 *   removed, duplicates collapse, inactive users are skipped, and dedupe keys
 *   use the partial unique index (user_id, dedupe_key).
 * - Watchers = explicit (non-muted subscriptions) ∪ implicit (project: owner,
 *   members, creator; task: creator, assignee) − muted rows.
 */

/** Default and maximum page sizes for listNotifications. */
export const NOTIFICATION_LIST_DEFAULT_LIMIT = 30;
export const NOTIFICATION_LIST_MAX_LIMIT = 100;
/** Longest title / body stored (notifications are short summaries). */
const TITLE_MAX = 200;
const BODY_MAX = 280;

/* -------------------------------- URLs ---------------------------------- */

/** Canonical in-app path of a task ("/tasks/PRX-12"), optionally anchored to a comment. */
export function taskNotificationUrl(taskNumber: number, commentId?: string | null): string {
  return `/tasks/${taskKey(taskNumber)}${commentId ? `#comment-${commentId}` : ""}`;
}

/** Project path, optionally on a tab and/or anchored to a comment. */
export function projectNotificationUrl(projectId: string, opts: { tab?: string; commentId?: string | null } = {}): string {
  const query = opts.tab ? `?tab=${encodeURIComponent(opts.tab)}` : "";
  return `/projects/${projectId}${query}${opts.commentId ? `#comment-${opts.commentId}` : ""}`;
}

/* ------------------------------- Helpers -------------------------------- */

function uniqueIds(ids: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && id.length > 0) seen.add(id);
  }
  return [...seen];
}

/** Single-line, length-capped text for notification titles and bodies. */
function oneLine(text: string, max: number): string {
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}

/**
 * Runs notification side effects after a mutation has committed. Failures are
 * logged and swallowed so a notification problem never reports the (already
 * saved) change as failed.
 */
export async function notifySafely(scope: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(`${scope}: notifications failed`, error);
  }
}

/* -------------------------------- notify -------------------------------- */

/**
 * Inserts one notification per recipient after removing the actor, duplicates
 * and inactive (or unknown) users. With a dedupe key, a recipient who already
 * has that key gets nothing. Returns the number of rows inserted.
 */
export async function notify(input: NotifyInput, q: Queryable = db): Promise<number> {
  const recipients = uniqueIds(input.recipients).filter((id) => id !== input.actor_id);
  if (recipients.length === 0) return 0;

  const ids = recipients.map(() => newId());
  const title = oneLine(input.title, TITLE_MAX);
  const body = oneLine(input.body ?? "", BODY_MAX);
  const dedupeKey = input.dedupe_key ? input.dedupe_key : null;

  return q.execute(
    `INSERT INTO notifications
       (id, user_id, type, actor_id, project_id, task_id, comment_id, title, body, url, dedupe_key, read_at, created_at)
     SELECT r.nid, r.uid, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12
       FROM unnest($1::text[], $2::text[]) AS r(nid, uid)
       JOIN users u ON u.id = r.uid AND u.is_active = TRUE
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [
      ids,
      recipients,
      input.type,
      input.actor_id,
      input.project_id ?? null,
      input.task_id ?? null,
      input.comment_id ?? null,
      title,
      body,
      input.url,
      dedupeKey,
      nowISO(),
    ],
  );
}

/* ------------------------------- Watchers ------------------------------- */

/**
 * SQL returning `user_id` of every active watcher of the entity in $1:
 * explicit (non-muted rows) ∪ implicit − muted.
 */
function watcherSql(entity: WatchEntity): string {
  const candidates =
    entity.type === "project"
      ? `SELECT user_id FROM subscriptions WHERE project_id = $1 AND muted = FALSE
         UNION SELECT owner_id FROM projects WHERE id = $1 AND owner_id IS NOT NULL
         UNION SELECT created_by FROM projects WHERE id = $1
         UNION SELECT user_id FROM project_members WHERE project_id = $1`
      : `SELECT user_id FROM subscriptions WHERE task_id = $1 AND muted = FALSE
         UNION SELECT created_by FROM tasks WHERE id = $1
         UNION SELECT assignee_id FROM tasks WHERE id = $1 AND assignee_id IS NOT NULL`;
  const column = entity.type === "project" ? "project_id" : "task_id";
  return `
    SELECT c.user_id
      FROM (${candidates}) AS c(user_id)
      JOIN users u ON u.id = c.user_id AND u.is_active = TRUE
     WHERE NOT EXISTS (
       SELECT 1 FROM subscriptions m
        WHERE m.${column} = $1 AND m.user_id = c.user_id AND m.muted = TRUE
     )`;
}

/** Active watcher ids of a project or task (explicit ∪ implicit − muted). */
export async function listWatcherIds(entity: WatchEntity, q: Queryable = db): Promise<string[]> {
  const rows = await q.query<{ user_id: string }>(watcherSql(entity), [entity.id]);
  return rows.map((row) => row.user_id);
}

/** Watchers as user summaries, by name. */
export async function listWatchers(entity: WatchEntity, q: Queryable = db): Promise<UserSummary[]> {
  return q.query<UserSummary>(
    `SELECT u.id, u.name, u.email, u.color, u.job_title
       FROM users u
      WHERE u.id IN (${watcherSql(entity)})
      ORDER BY lower(u.name) ASC`,
    [entity.id],
  );
}

export async function isWatching(userId: string, entity: WatchEntity, q: Queryable = db): Promise<boolean> {
  const row = await q.queryOne<{ watching: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM (${watcherSql(entity)}) w WHERE w.user_id = $2) AS watching`,
    [entity.id, userId],
  );
  return row?.watching === true;
}

/**
 * Notifies the entity's watchers plus `extraRecipients`, minus
 * `excludeRecipients` (e.g. people already notified about a mention).
 */
export async function notifyWatchers(
  input: Omit<NotifyInput, "recipients"> & {
    entity: WatchEntity;
    extraRecipients?: string[];
    excludeRecipients?: string[];
  },
  q: Queryable = db,
): Promise<number> {
  const { entity, extraRecipients = [], excludeRecipients = [], ...rest } = input;
  const watchers = await listWatcherIds(entity, q);
  const excluded = new Set(excludeRecipients);
  const recipients = uniqueIds([...watchers, ...extraRecipients]).filter((id) => !excluded.has(id));
  return notify({ ...rest, recipients }, q);
}

/**
 * Explicit subscriptions for people who should watch from now on (creators,
 * assignees, commenters). Never clears `muted`: an explicit Unwatch sticks.
 * Unknown user ids are ignored.
 */
export async function autoSubscribe(
  entity: WatchEntity,
  userIds: readonly (string | null | undefined)[],
  q: Queryable = db,
): Promise<void> {
  const ids = uniqueIds(userIds);
  if (ids.length === 0) return;
  const column = entity.type === "project" ? "project_id" : "task_id";
  await q.execute(
    `INSERT INTO subscriptions (id, user_id, ${column}, muted, created_at)
     SELECT r.sid, r.uid, $3, FALSE, $4
       FROM unnest($1::text[], $2::text[]) AS r(sid, uid)
       JOIN users u ON u.id = r.uid
     ON CONFLICT DO NOTHING`,
    [ids.map(() => newId()), ids, entity.id, nowISO()],
  );
}

async function upsertSubscription(userId: string, entity: WatchEntity, muted: boolean, q: Queryable): Promise<void> {
  const column = entity.type === "project" ? "project_id" : "task_id";
  await q.execute(
    `INSERT INTO subscriptions (id, user_id, ${column}, muted, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, ${column}) DO UPDATE SET muted = EXCLUDED.muted`,
    [newId(), userId, entity.id, muted, nowISO()],
  );
}

/** Explicit Watch: creates the row or clears a previous Unwatch. */
export async function watch(userId: string, entity: WatchEntity, q: Queryable = db): Promise<void> {
  await upsertSubscription(userId, entity, false, q);
}

/** Explicit Unwatch: a muted row removes the user even when they are an implicit watcher. */
export async function unwatch(userId: string, entity: WatchEntity, q: Queryable = db): Promise<void> {
  await upsertSubscription(userId, entity, true, q);
}

/* ------------------------------- Mentions ------------------------------- */

/** Active user ids mentioned in a body (`@[Name](user:<uuid>)`), in order of first mention. */
export async function resolveMentionRecipients(body: string, q: Queryable = db): Promise<string[]> {
  const mentioned = parseMentions(body);
  if (mentioned.length === 0) return [];
  const rows = await q.query<{ id: string }>(
    "SELECT id FROM users WHERE lower(id) = ANY($1::text[]) AND is_active = TRUE",
    [mentioned],
  );
  const active = new Map(rows.map((row) => [row.id.toLowerCase(), row.id]));
  return mentioned.flatMap((id) => {
    const match = active.get(id);
    return match ? [match] : [];
  });
}

/* ------------------------- Event helper: blockers ------------------------ */

/**
 * `blocker_cleared` for the assignees of the open tasks that `done` blocked,
 * one notification per blocked task. `blocked` is `listTasksBlockedBy(done.id)`
 * when the caller already has it; otherwise the same set is read on `q`.
 */
export async function notifyBlockersCleared(
  input: { done: { id: string; key: string }; blocked?: TaskRef[]; actorId: string | null },
  q: Queryable = db,
): Promise<number> {
  const scope = input.blocked
    ? { sql: "id = ANY($1::text[])", param: input.blocked.map((task) => task.id) as readonly string[] }
    : { sql: "id IN (SELECT task_id FROM task_dependencies WHERE blocked_by_id = $1)", param: input.done.id };
  if (Array.isArray(scope.param) && scope.param.length === 0) return 0;
  const rows = await q.query<{ id: string; number: number; title: string; project_id: string; assignee_id: string }>(
    `SELECT id, number, title, project_id, assignee_id
       FROM tasks
      WHERE ${scope.sql} AND assignee_id IS NOT NULL AND NOT (status = ANY($2::text[]))`,
    [scope.param, CLOSED_TASK_STATUSES],
  );
  let inserted = 0;
  for (const row of rows) {
    inserted += await notify(
      {
        recipients: [row.assignee_id],
        type: "blocker_cleared",
        actor_id: input.actorId,
        project_id: row.project_id,
        task_id: row.id,
        title: `${input.done.key} is done, so it no longer blocks ${taskKey(row.number)}`,
        body: row.title,
        url: taskNotificationUrl(row.number),
      },
      q,
    );
  }
  return inserted;
}

/* --------------------------------- Inbox -------------------------------- */

interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id: string | null;
  project_id: string | null;
  task_id: string | null;
  comment_id: string | null;
  title: string;
  body: string;
  url: string;
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_color: string | null;
  actor_job_title: string | null;
  project_name: string | null;
  task_number: number | null;
}

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    actor_id: row.actor_id,
    project_id: row.project_id,
    task_id: row.task_id,
    comment_id: row.comment_id,
    title: row.title,
    body: row.body,
    url: row.url,
    dedupe_key: row.dedupe_key,
    read_at: row.read_at,
    created_at: row.created_at,
    actor:
      row.actor_id && row.actor_name !== null
        ? {
            id: row.actor_id,
            name: row.actor_name,
            email: row.actor_email ?? "",
            color: row.actor_color ?? "#64748b",
            job_title: row.actor_job_title,
          }
        : null,
    project_name: row.project_name,
    task_key: row.task_number !== null ? taskKey(row.task_number) : null,
  };
}

/** The viewer's notifications, newest first (unread / mentions / all tabs, cursor by created_at). */
export async function listNotifications(userId: string, filters: NotificationFilters = {}): Promise<AppNotification[]> {
  const where = ["n.user_id = $1"];
  const params: (string | number)[] = [userId];
  if (filters.tab === "unread") where.push("n.read_at IS NULL");
  if (filters.tab === "mentions") where.push("n.type = 'mention'");
  if (filters.before) {
    params.push(filters.before);
    where.push(`n.created_at < $${params.length}`);
  }
  const requested = filters.limit ?? NOTIFICATION_LIST_DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(NOTIFICATION_LIST_MAX_LIMIT, Math.floor(requested)));
  params.push(limit);

  const rows = await db.query<NotificationRow>(
    `SELECT n.id, n.user_id, n.type, n.actor_id, n.project_id, n.task_id, n.comment_id,
            n.title, n.body, n.url, n.dedupe_key, n.read_at, n.created_at,
            a.name AS actor_name, a.email AS actor_email, a.color AS actor_color, a.job_title AS actor_job_title,
            p.name AS project_name, t.number AS task_number
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_id
       LEFT JOIN projects p ON p.id = n.project_id
       LEFT JOIN tasks t ON t.id = n.task_id
      WHERE ${where.join(" AND ")}
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map(toNotification);
}

export async function countUnread(userId: string): Promise<number> {
  const row = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [userId],
  );
  return row?.count ?? 0;
}

/** Marks the user's own notifications read (ids of other users are ignored). Returns rows changed. */
export async function markRead(userId: string, ids: string[]): Promise<number> {
  const unique = uniqueIds(ids);
  if (unique.length === 0) return 0;
  return db.execute(
    "UPDATE notifications SET read_at = $3 WHERE user_id = $1 AND id = ANY($2::text[]) AND read_at IS NULL",
    [userId, unique, nowISO()],
  );
}

export async function markAllRead(userId: string): Promise<number> {
  return db.execute("UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL", [userId, nowISO()]);
}

/** Deletes the user's read notifications created more than NOTIFICATION_RETENTION_DAYS before today. */
export async function pruneReadNotifications(userId: string, today: string): Promise<number> {
  const cutoff = addDaysISO(today, -NOTIFICATION_RETENTION_DAYS);
  return db.execute(
    "DELETE FROM notifications WHERE user_id = $1 AND read_at IS NOT NULL AND created_at < $2",
    [userId, cutoff],
  );
}

/* --------------------------- Time-based (lazy) --------------------------- */

interface DueTaskRow {
  id: string;
  number: number;
  title: string;
  project_id: string;
  due_date: string;
  project_name: string;
}

interface OwnedProjectRow {
  id: string;
  name: string;
  status: ProjectStatus;
  health_updated_at: string | null;
  created_at: string;
}

interface TuningProjectRow {
  id: string;
  name: string;
  go_live_date: string;
  tuning_days: number;
}

interface BudgetProjectRow {
  id: string;
  name: string;
  budget_hours: number;
  budget_period: BudgetPeriod;
  start_date: string | null;
  due_date: string | null;
  total_minutes: number;
  month_minutes: number;
}

async function generateDueSoon(userId: string, today: string): Promise<number> {
  const tomorrow = addDaysISO(today, 1);
  const tasks = await db.query<DueTaskRow>(
    `SELECT t.id, t.number, t.title, t.project_id, t.due_date, p.name AS project_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
      WHERE t.assignee_id = $1 AND t.due_date = $2 AND t.status = ANY($3::text[])`,
    [userId, tomorrow, OPEN_TASK_STATUSES],
  );
  let inserted = 0;
  for (const task of tasks) {
    inserted += await notify({
      recipients: [userId],
      type: "due_soon",
      actor_id: null,
      project_id: task.project_id,
      task_id: task.id,
      title: `${taskKey(task.number)} is due tomorrow`,
      body: `${task.title} · ${task.project_name}`,
      url: taskNotificationUrl(task.number),
      dedupe_key: `due:${task.id}:${task.due_date}`,
    });
  }
  return inserted;
}

async function generateUpdateDue(userId: string, today: string, timeZone: string, cadenceDays: number): Promise<number> {
  const projects = await db.query<OwnedProjectRow>(
    `SELECT id, name, status, health_updated_at, created_at
       FROM projects
      WHERE owner_id = $1 AND parent_id IS NULL AND status = 'ongoing'`,
    [userId],
  );
  const week = isoWeekKey(today);
  let inserted = 0;
  for (const project of projects) {
    if (!isUpdateDue(project, today, cadenceDays, timeZone)) continue;
    inserted += await notify({
      recipients: [userId],
      type: "update_due",
      actor_id: null,
      project_id: project.id,
      title: `${project.name} needs a status update`,
      body: `No update in the last ${cadenceDays} days.`,
      url: projectNotificationUrl(project.id, { tab: "updates" }),
      dedupe_key: `stale:${project.id}:${week}`,
    });
  }
  return inserted;
}

async function generateTuningEnding(userId: string, today: string, isAdmin: boolean): Promise<number> {
  const projects = await db.query<TuningProjectRow>(
    `SELECT id, name, go_live_date, tuning_days
       FROM projects
      WHERE go_live_date IS NOT NULL AND tuning_closed_at IS NULL
        AND status = ANY($2::text[])
        AND ($3::boolean OR owner_id = $1)`,
    [userId, OPEN_STATUSES, isAdmin],
  );
  let inserted = 0;
  for (const project of projects) {
    const end = tuningEndDate(project.go_live_date, project.tuning_days);
    if (!end) continue;
    const daysLeft = diffDaysISO(today, end);
    if (daysLeft < 0 || daysLeft > TUNING_ALERT_DAYS) continue;
    inserted += await notify({
      recipients: [userId],
      type: "tuning_ending",
      actor_id: null,
      project_id: project.id,
      title:
        daysLeft === 0
          ? `The tuning window of ${project.name} ends today`
          : `The tuning window of ${project.name} ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
      body: `Tuning ends ${end}. Close tuning or propose a retainer.`,
      url: projectNotificationUrl(project.id),
      dedupe_key: `tuning:${project.id}:${TUNING_ALERT_DAYS}`,
    });
  }
  return inserted;
}

/**
 * Catch-up for budget thresholds. They are event-driven (W5 time notifies when
 * a write crosses one); this lazy pass uses the same dedupe key, so a
 * threshold is announced once per recipient whichever path sees it first.
 */
async function generateBudgetThresholds(userId: string, today: string, isAdmin: boolean): Promise<number> {
  const month = budgetPeriodRange("monthly", today);
  const projects = await db.query<BudgetProjectRow>(
    `SELECT p.id, p.name, p.budget_hours, p.budget_period, p.start_date, p.due_date,
            COALESCE(SUM(e.minutes), 0)::int AS total_minutes,
            COALESCE(SUM(e.minutes) FILTER (WHERE e.entry_date >= $3 AND e.entry_date <= $4), 0)::int AS month_minutes
       FROM projects p
       LEFT JOIN time_entries e ON e.project_id = p.id
      WHERE p.budget_hours IS NOT NULL AND p.budget_hours > 0
        AND p.status = ANY($2::text[])
        AND ($5::boolean OR p.owner_id = $1)
      GROUP BY p.id`,
    [userId, OPEN_STATUSES, month.from ?? today, month.to ?? today, isAdmin],
  );
  let inserted = 0;
  for (const project of projects) {
    const burn = computeBudgetBurn({
      budget_hours: project.budget_hours,
      budget_period: project.budget_period,
      start_date: project.start_date,
      due_date: project.due_date,
      logged_minutes: project.budget_period === "monthly" ? project.month_minutes : project.total_minutes,
      today,
    });
    if (!burn || burn.threshold === 0) continue;
    const scope = burn.period === "monthly" ? "this month's" : "the";
    inserted += await notify({
      recipients: [userId],
      type: "budget_threshold",
      actor_id: null,
      project_id: project.id,
      title: `${project.name} has used ${burn.burn_pct}% of ${scope} hours budget`,
      body: `Crossed the ${burn.threshold}% threshold of ${burn.budget_hours}h.`,
      url: projectNotificationUrl(project.id, { tab: "time" }),
      dedupe_key: `budget:${project.id}:${burn.threshold}:${burn.period_start ?? "total"}`,
    });
  }
  return inserted;
}

/**
 * Lazy, idempotent time-based notifications for one user (no cron): run on
 * /inbox and Home loads. `today` and `timeZone` are the workspace's; the
 * update cadence is read from app settings unless the caller passes it.
 * Returns the number of new notifications.
 */
export async function generateTimeBasedNotifications(
  userId: string,
  today: string,
  timeZone: string,
  options: { cadenceDays?: number } = {},
): Promise<number> {
  const user = await db.queryOne<{ role: string; is_active: boolean }>(
    "SELECT role, is_active FROM users WHERE id = $1",
    [userId],
  );
  if (!user || user.is_active !== true) return 0;
  const isAdmin = user.role === "admin";

  let cadenceDays = options.cadenceDays;
  if (cadenceDays === undefined) {
    const settings = await db.queryOne<{ update_cadence_days: number }>(
      "SELECT update_cadence_days FROM app_settings WHERE id = 1",
    );
    cadenceDays = settings?.update_cadence_days ?? DEFAULT_UPDATE_CADENCE_DAYS;
  }

  const counts = await Promise.all([
    generateDueSoon(userId, today),
    generateUpdateDue(userId, today, timeZone, cadenceDays),
    generateTuningEnding(userId, today, isAdmin),
    generateBudgetThresholds(userId, today, isAdmin),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

/** Whether the project or task still exists (watch actions check before writing). */
export async function watchEntityExists(entity: WatchEntity): Promise<boolean> {
  const table = entity.type === "project" ? "projects" : "tasks";
  const row = await db.queryOne<{ found: boolean }>(`SELECT EXISTS (SELECT 1 FROM ${table} WHERE id = $1) AS found`, [
    entity.id,
  ]);
  return row?.found === true;
}

/* ------------------- Event notifications used by actions ------------------- */

/** The person acting (never notified). */
export interface NotificationActor {
  id: string;
  name: string;
}

function taskEntity(taskId: string): WatchEntity {
  return { type: "task", id: taskId };
}

function taskBody(task: Pick<TaskWithMeta, "title" | "project">): string {
  return `${task.title} · ${task.project.name}`;
}

/** New task: the creator and assignee watch it; the assignee gets `assigned`. */
export async function notifyTaskCreated(task: TaskWithMeta, actor: NotificationActor, q: Queryable = db): Promise<void> {
  await autoSubscribe(taskEntity(task.id), [task.created_by, task.assignee_id], q);
  if (task.assignee_id) {
    await notify(
      {
        recipients: [task.assignee_id],
        type: "assigned",
        actor_id: actor.id,
        project_id: task.project_id,
        task_id: task.id,
        title: `${actor.name} assigned you ${task.key}`,
        body: taskBody(task),
        url: taskNotificationUrl(task.number),
      },
      q,
    );
  }
}

/**
 * After a task edit, move or status change: `assigned` to a new assignee (who
 * is subscribed), `task_status` to the task's watchers when the status
 * changed, and `blocker_cleared` to the assignees of tasks it blocked when it
 * became done.
 */
export async function notifyTaskChanged(
  before: TaskWithMeta,
  after: TaskWithMeta,
  actor: NotificationActor,
  q: Queryable = db,
): Promise<void> {
  const newAssignee = after.assignee_id !== null && after.assignee_id !== before.assignee_id ? after.assignee_id : null;
  if (newAssignee) {
    await autoSubscribe(taskEntity(after.id), [newAssignee], q);
    await notify(
      {
        recipients: [newAssignee],
        type: "assigned",
        actor_id: actor.id,
        project_id: after.project_id,
        task_id: after.id,
        title: `${actor.name} assigned you ${after.key}`,
        body: taskBody(after),
        url: taskNotificationUrl(after.number),
      },
      q,
    );
  }

  if (before.status === after.status) return;
  await notifyWatchers(
    {
      entity: taskEntity(after.id),
      // A brand-new assignee already heard about the task through `assigned`.
      excludeRecipients: newAssignee ? [newAssignee] : [],
      type: "task_status",
      actor_id: actor.id,
      project_id: after.project_id,
      task_id: after.id,
      title: `${actor.name} moved ${after.key} to ${TASK_STATUS_CONFIG[after.status].label}`,
      body: taskBody(after),
      url: taskNotificationUrl(after.number),
    },
    q,
  );

  if (after.status === "done") {
    await notifyBlockersCleared({ done: { id: after.id, key: after.key }, actorId: actor.id }, q);
  }
}

/**
 * New comment on a task (pass `task`) or a project: the commenter watches it,
 * mentioned people get `mention`, every other watcher gets `comment`.
 */
export async function notifyCommentAdded(
  input: {
    comment: Pick<Comment, "id" | "body" | "project_id">;
    actor: NotificationActor;
    task: Pick<TaskWithMeta, "id" | "number" | "key" | "title" | "project_id" | "project"> | null;
    projectName: string;
  },
  q: Queryable = db,
): Promise<void> {
  const { comment, actor, task } = input;
  const entity: WatchEntity = task ? taskEntity(task.id) : { type: "project", id: comment.project_id };
  const where = task ? task.key : input.projectName;
  const url = task
    ? taskNotificationUrl(task.number, comment.id)
    : projectNotificationUrl(comment.project_id, { commentId: comment.id });
  const excerpt = mentionsToPlainText(comment.body);
  const base = {
    actor_id: actor.id,
    project_id: comment.project_id,
    task_id: task?.id ?? null,
    comment_id: comment.id,
    body: excerpt,
    url,
  };

  await autoSubscribe(entity, [actor.id], q);
  const mentioned = (await resolveMentionRecipients(comment.body, q)).filter((id) => id !== actor.id);
  if (mentioned.length > 0) {
    await notify(
      { ...base, recipients: mentioned, type: "mention", title: `${actor.name} mentioned you ${task ? "on" : "in"} ${where}` },
      q,
    );
  }
  await notifyWatchers(
    { ...base, entity, excludeRecipients: mentioned, type: "comment", title: `${actor.name} commented on ${where}` },
    q,
  );
}

/** A phase entered gate review: the project owner and every active admin. */
export async function notifyGateReviewRequested(
  milestone: Pick<Milestone, "id" | "name" | "project_id">,
  actor: NotificationActor,
  q: Queryable = db,
): Promise<number> {
  const project = await q.queryOne<{ name: string; owner_id: string | null }>(
    "SELECT name, owner_id FROM projects WHERE id = $1",
    [milestone.project_id],
  );
  if (!project) return 0;
  const admins = await q.query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE");
  return notify(
    {
      recipients: [project.owner_id, ...admins.map((admin) => admin.id)].filter((id): id is string => id !== null),
      type: "gate_review",
      actor_id: actor.id,
      project_id: milestone.project_id,
      title: `${actor.name} requested a gate review for ${milestone.name}`,
      body: `${project.name} is waiting for a Go, Extend or Stop decision.`,
      url: projectNotificationUrl(milestone.project_id),
    },
    q,
  );
}

/** Project owner, members and creator watch the project explicitly (create/update/member edits). */
export async function subscribeProjectPeople(
  project: { id: string; owner_id?: string | null; created_by?: string | null },
  memberIds: readonly string[] = [],
  q: Queryable = db,
): Promise<void> {
  await autoSubscribe({ type: "project", id: project.id }, [project.owner_id, project.created_by, ...memberIds], q);
}
