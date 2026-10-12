import { db, newId, nowISO, type SqlParam } from "@/lib/db";
import { OPEN_STATUSES } from "@/lib/constants";
import { colorFromString } from "@/lib/utils";
import type { Role, User, UserSummary } from "@/lib/types";

/** Raw `users` row: `is_active` is a BOOLEAN column, returned as a JS boolean. */
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  job_title: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  weekly_capacity_hours: number;
}

interface UserAuthRow extends UserRow {
  password_hash: string;
}

// cost_rate is admin-only and deliberately NOT selected here (see UserCostRate in types.ts).
const USER_COLUMNS =
  "id, name, email, role, color, job_title, is_active, created_at, updated_at, weekly_capacity_hours";
const SUMMARY_COLUMNS = "id, name, email, color, job_title";

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    color: row.color,
    job_title: row.job_title,
    is_active: row.is_active === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
    weekly_capacity_hours: row.weekly_capacity_hours,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listUsers(opts: { includeInactive?: boolean } = {}): Promise<User[]> {
  const where = opts.includeInactive ? "" : "WHERE is_active = TRUE";
  const rows = await db.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users ${where} ORDER BY lower(name) ASC`,
  );
  return rows.map(toUser);
}

export async function listUserSummaries(): Promise<UserSummary[]> {
  return db.query<UserSummary>(
    `SELECT ${SUMMARY_COLUMNS} FROM users WHERE is_active = TRUE ORDER BY lower(name) ASC`,
  );
}

export async function getUserById(id: string): Promise<User | null> {
  const row = await db.queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return row ? toUser(row) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const row = await db.queryOne<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = $1`,
    [normalizeEmail(email)],
  );
  return row ? toUser(row) : null;
}

export async function getUserAuthByEmail(
  email: string,
): Promise<(User & { password_hash: string }) | null> {
  const row = await db.queryOne<UserAuthRow>(
    `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE lower(email) = $1`,
    [normalizeEmail(email)],
  );
  return row ? { ...toUser(row), password_hash: row.password_hash } : null;
}

export async function getPasswordHash(userId: string): Promise<string | null> {
  const row = await db.queryOne<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = $1",
    [userId],
  );
  return row?.password_hash ?? null;
}

export async function countUsers(): Promise<number> {
  const row = await db.queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
  return row?.n ?? 0;
}

/** Number of ACTIVE admins (deactivated admins cannot manage anything). */
export async function countAdmins(): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND is_active = TRUE",
  );
  return row?.n ?? 0;
}

export async function createUser(input: {
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  color?: string;
  job_title?: string | null;
}): Promise<User> {
  const now = nowISO();
  const email = normalizeEmail(input.email);
  const row = await db.queryOne<UserRow>(
    `INSERT INTO users (id, name, email, password_hash, role, color, job_title, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9)
     RETURNING ${USER_COLUMNS}`,
    [
      newId(),
      input.name.trim(),
      email,
      input.password_hash,
      input.role,
      input.color ?? colorFromString(email),
      input.job_title?.trim() || null,
      now,
      now,
    ],
  );
  if (!row) throw new Error("Failed to create user");
  return toUser(row);
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<User, "name" | "job_title" | "color" | "role" | "is_active">>,
): Promise<User> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  const bind = (value: SqlParam): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (patch.name !== undefined) sets.push(`name = ${bind(patch.name.trim())}`);
  if (patch.job_title !== undefined) sets.push(`job_title = ${bind(patch.job_title?.trim() || null)}`);
  if (patch.color !== undefined) sets.push(`color = ${bind(patch.color)}`);
  if (patch.role !== undefined) sets.push(`role = ${bind(patch.role)}`);
  if (patch.is_active !== undefined) sets.push(`is_active = ${bind(patch.is_active === true)}`);
  sets.push(`updated_at = ${bind(nowISO())}`);

  const row = await db.queryOne<UserRow>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = ${bind(id)} RETURNING ${USER_COLUMNS}`,
    params,
  );
  if (!row) throw new Error(`User ${id} not found`);
  return toUser(row);
}

export async function updatePassword(userId: string, password_hash: string): Promise<void> {
  const changed = await db.execute(
    "UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3",
    [password_hash, nowISO(), userId],
  );
  if (changed === 0) throw new Error(`User ${userId} not found`);
}

/**
 * Per user id, the number of OPEN projects (any depth) where the user is the
 * owner or a member. UNION (not UNION ALL) so owner+member counts once.
 */
export async function getUserProjectCounts(): Promise<Record<string, number>> {
  const rows = await db.query<{ user_id: string; n: number }>(
    `SELECT t.user_id, COUNT(*)::int AS n FROM (
       SELECT p.owner_id AS user_id, p.id AS project_id
         FROM projects p
        WHERE p.owner_id IS NOT NULL AND p.status = ANY($1::text[])
       UNION
       SELECT pm.user_id AS user_id, pm.project_id AS project_id
         FROM project_members pm
         JOIN projects p ON p.id = pm.project_id
        WHERE p.status = ANY($1::text[])
     ) AS t
     GROUP BY t.user_id`,
    [OPEN_STATUSES],
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.user_id] = row.n;
  return counts;
}
