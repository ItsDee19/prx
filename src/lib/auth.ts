import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_ALLOWED_EMAIL_DOMAINS, SESSION_COOKIE } from "@/lib/constants";
import {
  createSession,
  deleteSessionByToken,
  getUserBySessionToken,
} from "@/lib/data/sessions";
import type { Project, User } from "@/lib/types";

/**
 * Request-scoped auth helpers. Only server components, layouts and server
 * actions may import this module (it is marked `server-only`).
 */

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires,
  };
}

/** The signed-in user for this request, memoised per request via React cache(). */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserBySessionToken(token);
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  // A cookie that no longer maps to a live session: send the browser to the login
  // page with ?expired=1 so the middleware clears the stale cookie instead of
  // bouncing back to the dashboard.
  if (!user) redirect("/login?expired=1");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/** Creates a DB session and sets the cookie; the cookie expires with the session. */
export async function startSession(userId: string): Promise<void> {
  const { token, expiresAt } = createSession(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(new Date(expiresAt)));
}

/** Deletes the DB session (if any) and clears the cookie. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) deleteSessionByToken(token);
  store.set(SESSION_COOKIE, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}

export function canDeleteProject(user: User, project: Project): boolean {
  return user.role === "admin" || project.created_by === user.id || project.owner_id === user.id;
}

/**
 * Email domains allowed to self-register. Unset env -> the default list;
 * an explicitly empty value -> no restriction (empty array).
 */
export function getAllowedEmailDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS;
  if (raw === undefined) return [...DEFAULT_ALLOWED_EMAIL_DOMAINS];
  return raw
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter((domain) => domain.length > 0);
}
