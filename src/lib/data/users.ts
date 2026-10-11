import { getDb, newId, nowISO } from "@/lib/db";
import { OPEN_STATUSES } from "@/lib/constants";
import { colorFromString } from "@/lib/utils";
import type { Role, User, UserSummary } from "@/lib/types";

/** Raw `users` row: `is_active` is stored as 0/1 and mapped to boolean here. */
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  color: string;
  job_title: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface UserAuthRow extends UserRow {
  password_hash: string;
}

const USER_COLUMNS = "id, name, email, role, color, job_title, is_active, created_at, updated_at";
const SUMMARY_COLUMNS = "id, name, email, color, job_title";

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    color: row.color,
    job_title: row.job_title,
    is_active: row.is_active === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function listUsers(opts: { includeInactive?: boolean } = {}): User[] {
  const where = opts.includeInactive ? "" : "WHERE is_active = 1";
  const rows = getDb()
    .prepare<[], UserRow>(`SELECT ${USER_COLUMNS} FROM users ${where} ORDER BY name COLLATE NOCASE ASC`)
    .all();
  return rows.map(toUser);
}

export function listUserSummaries(): UserSummary[] {
  return getDb()
    .prepare<[], UserSummary>(
      `SELECT ${SUMMARY_COLUMNS} FROM users WHERE is_active = 1 ORDER BY name COLLATE NOCASE ASC`,
    )
    .all();
}

export function getUserById(id: string): User | null {
  const row = getDb()
    .prepare<[string], UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .get(id);
  return row ? toUser(row) : null;
}

export function getUserByEmail(email: string): User | null {
  const row = getDb()
    .prepare<[string], UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = ?`)
    .get(normalizeEmail(email));
  return row ? toUser(row) : null;
}

export function getUserAuthByEmail(email: string): (User & { password_hash: string }) | null {
  const row = getDb()
    .prepare<[string], UserAuthRow>(
      `SELECT ${USER_COLUMNS}, password_hash FROM users WHERE lower(email) = ?`,
    )
    .get(normalizeEmail(email));
  return row ? { ...toUser(row), password_hash: row.password_hash } : null;
}

export function getPasswordHash(userId: string): string | null {
  const hash = getDb()
    .prepare<[string], string>("SELECT password_hash FROM users WHERE id = ?")
    .pluck()
    .get(userId);
  return hash ?? null;
}

export function countUsers(): number {
  return getDb().prepare<[], number>("SELECT COUNT(*) FROM users").pluck().get() ?? 0;
}

/** Number of ACTIVE admins (deactivated admins cannot manage anything). */
export function countAdmins(): number {
  return (
    getDb()
      .prepare<[], number>("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1")
      .pluck()
      .get() ?? 0
  );
}

export function createUser(input: {
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  color?: string;
  job_title?: string | null;
}): User {
  const id = newId();
  const now = nowISO();
  const email = normalizeEmail(input.email);
  getDb()
    .prepare(
      `INSERT INTO users (id, name, email, password_hash, role, color, job_title, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      id,
      input.name.trim(),
      email,
      input.password_hash,
      input.role,
      input.color ?? colorFromString(email),
      input.job_title?.trim() || null,
      now,
      now,
    );
  const created = getUserById(id);
  if (!created) throw new Error("Failed to create user");
  return created;
}

export function updateUser(
  id: string,
  patch: Partial<Pick<User, "name" | "job_title" | "color" | "role" | "is_active">>,
): User {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(patch.name.trim());
  }
  if (patch.job_title !== undefined) {
    sets.push("job_title = ?");
    params.push(patch.job_title?.trim() || null);
  }
  if (patch.color !== undefined) {
    sets.push("color = ?");
    params.push(patch.color);
  }
  if (patch.role !== undefined) {
    sets.push("role = ?");
    params.push(patch.role);
  }
  if (patch.is_active !== undefined) {
    sets.push("is_active = ?");
    params.push(patch.is_active ? 1 : 0);
  }
  sets.push("updated_at = ?");
  params.push(nowISO());

  const result = getDb()
    .prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params, id);
  if (result.changes === 0) throw new Error(`User ${id} not found`);
  const updated = getUserById(id);
  if (!updated) throw new Error(`User ${id} not found`);
  return updated;
}

export function updatePassword(userId: string, password_hash: string): void {
  const result = getDb()
    .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
    .run(password_hash, nowISO(), userId);
  if (result.changes === 0) throw new Error(`User ${userId} not found`);
}

/**
 * Per user id, the number of OPEN projects (any depth) where the user is the
 * owner or a member. UNION (not UNION ALL) so owner+member counts once.
 */
export function getUserProjectCounts(): Record<string, number> {
  const open = OPEN_STATUSES.map(() => "?").join(", ");
  const rows = getDb()
    .prepare<string[], { user_id: string; n: number }>(
      `SELECT user_id, COUNT(*) AS n FROM (
         SELECT p.owner_id AS user_id, p.id AS project_id
           FROM projects p
          WHERE p.owner_id IS NOT NULL AND p.status IN (${open})
         UNION
         SELECT pm.user_id AS user_id, pm.project_id AS project_id
           FROM project_members pm
           JOIN projects p ON p.id = pm.project_id
          WHERE p.status IN (${open})
       ) GROUP BY user_id`,
    )
    .all(...OPEN_STATUSES, ...OPEN_STATUSES);
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.user_id] = row.n;
  return counts;
}
