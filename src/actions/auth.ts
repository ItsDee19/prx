"use server";

import { redirect } from "next/navigation";
import { endSession, getAllowedEmailDomains, startSession } from "@/lib/auth";
import { countUsers, createUser, getUserAuthByEmail, getUserByEmail } from "@/lib/data/users";
import { hashPassword, verifyPassword } from "@/lib/password";
import { fieldErrorsFromIssues, loginSchema, registerSchema } from "@/lib/validation";
import type { FormState, Role } from "@/lib/types";

const INVALID_CREDENTIALS = "Invalid email or password";
const CHECK_FIELDS = "Please check the highlighted fields.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Only same-origin absolute paths; "//host" and "/\host" are protocol-relative. */
function safeNext(next: string | undefined): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}

export async function loginAction(prev: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    email: field(formData, "email"),
    password: field(formData, "password"),
    next: field(formData, "next") || undefined,
  };
  const values = { email: raw.email.trim() };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: CHECK_FIELDS,
      fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
      values,
    };
  }

  try {
    const user = await getUserAuthByEmail(parsed.data.email);
    const passwordOk = user ? await verifyPassword(parsed.data.password, user.password_hash) : false;
    // One generic message for unknown email, wrong password and deactivated accounts.
    if (!user || !passwordOk || !user.is_active) {
      return { ok: false, error: INVALID_CREDENTIALS, values };
    }
    await startSession(user.id);
  } catch (error) {
    console.error("loginAction failed", error);
    return { ok: false, error: "Something went wrong while signing in. Please try again.", values };
  }

  // redirect() throws, so it must stay outside the try/catch above.
  redirect(safeNext(parsed.data.next));
}

export async function registerAction(prev: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    name: field(formData, "name"),
    email: field(formData, "email"),
    password: field(formData, "password"),
    confirm_password: field(formData, "confirm_password"),
  };
  const values = { name: raw.name.trim(), email: raw.email.trim() };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: CHECK_FIELDS,
      fieldErrors: fieldErrorsFromIssues(parsed.error.issues),
      values,
    };
  }

  const domains = getAllowedEmailDomains();
  const domain = parsed.data.email.split("@")[1] ?? "";
  if (domains.length > 0 && !domains.includes(domain)) {
    const allowed = domains.map((d) => `@${d}`).join(", ");
    const message = `Only ${allowed} addresses can register`;
    return { ok: false, error: message, fieldErrors: { email: message }, values };
  }

  try {
    if (await getUserByEmail(parsed.data.email)) {
      const message = "An account with this email already exists";
      return { ok: false, error: message, fieldErrors: { email: message }, values };
    }
    // The very first account becomes the admin so the workspace is never locked out.
    const role: Role = (await countUsers()) === 0 ? "admin" : "member";
    const user = await createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      password_hash: await hashPassword(parsed.data.password),
      role,
    });
    await startSession(user.id);
  } catch (error) {
    console.error("registerAction failed", error);
    return {
      ok: false,
      error: "Something went wrong while creating your account. Please try again.",
      values,
    };
  }

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
