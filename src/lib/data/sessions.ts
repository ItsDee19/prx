import { createHash, randomBytes } from "node:crypto";
import { db, nowISO } from "@/lib/db";
import { SESSION_DURATION_DAYS } from "@/lib/constants";
import { getUserById } from "@/lib/data/users";
import type { User } from "@/lib/types";

/**
 * Sessions are stored by the SHA-256 hex of the raw cookie token, so a leaked
 * database dump cannot be replayed as a cookie.
 */

const DAY_MS = 86_400_000;
/** Expired rows are swept at most this often (per server instance). */
const SWEEP_INTERVAL_MS = 60_000;
let lastSweepAt = 0;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function sweepExpiredSessions(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  await db.execute("DELETE FROM sessions WHERE expires_at <= $1", [new Date(now).toISOString()]);
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * DAY_MS).toISOString();
  await db.execute(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)",
    [hashToken(token), userId, expiresAt, nowISO()],
  );
  return { token, expiresAt };
}

/** Resolves the user for a raw cookie token; null if missing, expired or the user is inactive. */
export async function getUserBySessionToken(token: string): Promise<User | null> {
  if (!token) return null;
  await sweepExpiredSessions();
  const id = hashToken(token);
  const row = await db.queryOne<{ user_id: string; expires_at: string }>(
    "SELECT user_id, expires_at FROM sessions WHERE id = $1",
    [id],
  );
  if (!row) return null;
  if (row.expires_at <= nowISO()) {
    await db.execute("DELETE FROM sessions WHERE id = $1", [id]);
    return null;
  }
  const user = await getUserById(row.user_id);
  return user && user.is_active ? user : null;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  if (!token) return;
  await db.execute("DELETE FROM sessions WHERE id = $1", [hashToken(token)]);
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await db.execute("DELETE FROM sessions WHERE user_id = $1", [userId]);
}
