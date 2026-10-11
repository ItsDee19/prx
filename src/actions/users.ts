"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth";
import { deleteUserSessions } from "@/lib/data/sessions";
import {
  countAdmins,
  createUser,
  getPasswordHash,
  getUserByEmail,
  getUserById,
  updatePassword,
  updateUser,
} from "@/lib/data/users";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { ActionResult, Role, User } from "@/lib/types";
import {
  changePasswordSchema,
  createUserSchema,
  fieldErrorsFromIssues,
  profileSchema,
} from "@/lib/validation";

const FIX_FIELDS = "Please fix the highlighted fields.";
const USER_NOT_FOUND = "This user no longer exists.";

function revalidate(): void {
  revalidatePath("/", "layout");
}

function validationFailure(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : FIX_FIELDS, fieldErrors };
}

function failure(error: unknown, message: string): ActionResult<never> {
  console.error(message, error);
  return { ok: false, error: message };
}

/* ------------------------------ Admin-only ------------------------------- */

export async function createUserAction(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  job_title?: string | null;
}): Promise<ActionResult<User>> {
  await requireAdmin();
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    if (getUserByEmail(parsed.data.email)) {
      return validationFailure({ email: "A user with this email already exists" });
    }
    const user = createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      password_hash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
      job_title: parsed.data.job_title ?? null,
    });
    revalidate();
    return { ok: true, data: user };
  } catch (error) {
    return failure(error, "Could not create the user. Please try again.");
  }
}

export async function updateUserRoleAction(id: string, role: Role): Promise<ActionResult<User>> {
  await requireAdmin();
  const parsed = z.enum(["admin", "member"]).safeParse(role);
  if (!parsed.success) return { ok: false, error: "Choose a valid role." };

  try {
    const target = getUserById(id);
    if (!target) return { ok: false, error: USER_NOT_FOUND };
    if (target.role === parsed.data) return { ok: true, data: target };
    if (target.role === "admin" && target.is_active && countAdmins() <= 1) {
      return { ok: false, error: "You cannot demote the last active admin." };
    }
    const updated = updateUser(id, { role: parsed.data });
    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not change the role. Please try again.");
  }
}

export async function setUserActiveAction(id: string, active: boolean): Promise<ActionResult<User>> {
  const admin = await requireAdmin();
  if (typeof active !== "boolean") return { ok: false, error: "Invalid request." };

  try {
    const target = getUserById(id);
    if (!target) return { ok: false, error: USER_NOT_FOUND };
    if (!active && target.id === admin.id) {
      return { ok: false, error: "You cannot deactivate your own account." };
    }
    if (!active && target.role === "admin" && target.is_active && countAdmins() <= 1) {
      return { ok: false, error: "You cannot deactivate the last active admin." };
    }
    if (target.is_active === active) return { ok: true, data: target };

    const updated = updateUser(id, { is_active: active });
    // A deactivated user must be signed out everywhere immediately.
    if (!active) deleteUserSessions(id);
    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, active ? "Could not reactivate the user." : "Could not deactivate the user.");
  }
}

export async function resetUserPasswordAction(
  id: string,
  newPassword: string,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = createUserSchema.shape.password.safeParse(newPassword);
  if (!parsed.success) {
    return validationFailure({ password: parsed.error.issues[0]?.message ?? "Invalid password" });
  }

  try {
    const target = getUserById(id);
    if (!target) return { ok: false, error: USER_NOT_FOUND };
    updatePassword(id, await hashPassword(parsed.data));
    deleteUserSessions(id);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not reset the password. Please try again.");
  }
}

/* ------------------------------- Own profile ----------------------------- */

export async function updateProfileAction(input: {
  name: string;
  job_title?: string | null;
  color: string;
}): Promise<ActionResult<User>> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const updated = updateUser(user.id, {
      name: parsed.data.name,
      job_title: parsed.data.job_title ?? null,
      color: parsed.data.color,
    });
    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not save your profile. Please try again.");
  }
}

export async function changePasswordAction(input: {
  current_password: string;
  new_password: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const hash = getPasswordHash(user.id);
    const currentOk = hash ? await verifyPassword(parsed.data.current_password, hash) : false;
    if (!currentOk) return validationFailure({ current_password: "Current password is incorrect" });

    updatePassword(user.id, await hashPassword(parsed.data.new_password));
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not change your password. Please try again.");
  }
}
