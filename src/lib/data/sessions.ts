import { createHash, randomBytes } from "node:crypto";
import { getDb, nowISO } from "@/lib/db";
import { SESSION_DURATION_DAYS } from "@/lib/constants";
import { getUserById } from "@/lib/data/users";
import type { User } from "@/lib/types";

/**
 * Sessions are stored by the SHA-256 hex of the raw cookie token, so a leaked
 * database dump cannot be replayed as a cookie.
 */

const DAY_MS = 86_400_000;
/** Expired rows are swept at most this often (per process). */
const SWEEP_INTERVAL_MS = 60_000;
let lastSweepAt = 0;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sweepExpiredSessions(): void {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date(now).toISOString());
}

export function createSession(userId: string): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * DAY_MS).toISOString();
  getDb()
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(hashToken(token), userId, expiresAt, nowISO());
  return { token, expiresAt };
}

/** Resolves the user for a raw cookie token; null if missing, expired or the user is inactive. */
export function getUserBySessionToken(token: string): User | null {
  if (!token) return null;
  sweepExpiredSessions();
  const db = getDb();
  const id = hashToken(token);
  const row = db
    .prepare<[string], { user_id: string; expires_at: string }>(
      "SELECT user_id, expires_at FROM sessions WHERE id = ?",
    )
    .get(id);
  if (!row) return null;
  if (row.expires_at <= nowISO()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return null;
  }
  const user = getUserById(row.user_id);
  return user && user.is_active ? user : null;
}

export function deleteSessionByToken(token: string): void {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
}

export function deleteUserSessions(userId: string): void {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}
