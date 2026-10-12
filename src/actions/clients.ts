"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activity";
import { createClient, deleteClient, getClient, suggestClientCode, updateClient } from "@/lib/data/clients";
import { clientNameSchema, createClientSchema, updateClientSchema } from "@/lib/schemas/clients";
import type { ActionResult, Client, CreateClientInput, UpdateClientInput } from "@/lib/types";
import { fieldErrorsFromIssues } from "@/lib/validation";

/**
 * Client CRUD. Activity is logged with `project_id = null` and
 * `meta.client_id` (SPEC.md section 23.1); messages never contain amounts.
 */

const NOT_FOUND = "This client no longer exists.";

function revalidate(): void {
  revalidatePath("/", "layout");
}

function invalid(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : "Please fix the highlighted fields.", fieldErrors };
}

/**
 * Plain `Error`s thrown by the data layer carry user-facing sentences and are
 * passed through; database errors (which have a `code`) and anything else get
 * the friendly fallback. A duplicate code is reported on the code field.
 */
function failure(error: unknown, fallback: string): ActionResult<never> {
  const userFacing =
    error instanceof Error && error.constructor === Error && !("code" in error) && /[.!?]$/.test(error.message);
  if (!userFacing) {
    console.error(fallback, error);
    return { ok: false, error: fallback };
  }
  const message = (error as Error).message;
  return /^The code |^Client codes /.test(message)
    ? { ok: false, error: message, fieldErrors: { code: message } }
    : { ok: false, error: message };
}

/** Member: creates a client. */
export async function createClientAction(input: CreateClientInput): Promise<ActionResult<Client>> {
  const user = await requireUser();
  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrorsFromIssues(parsed.error.issues));
  try {
    const client = await createClient(parsed.data, user.id);
    await logActivity({
      project_id: null,
      actor_id: user.id,
      type: "client_created",
      message: `created client ${client.name} (${client.code})`,
      meta: { client_id: client.id, name: client.name, code: client.code },
    });
    revalidate();
    return { ok: true, data: client };
  } catch (error) {
    return failure(error, "Could not create the client. Please try again.");
  }
}

/** Member: edits a client; `archived` archives or restores it. */
export async function updateClientAction(id: string, input: UpdateClientInput): Promise<ActionResult<Client>> {
  const user = await requireUser();
  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) return invalid(fieldErrorsFromIssues(parsed.error.issues));
  try {
    const existing = await getClient(id);
    if (!existing) return { ok: false, error: NOT_FOUND };
    const client = await updateClient(existing.id, parsed.data);

    const archivedNow = Boolean(client.archived_at) && !existing.archived_at;
    const restored = !client.archived_at && Boolean(existing.archived_at);
    const message = archivedNow
      ? `archived client ${client.name}`
      : restored
        ? `restored client ${client.name}`
        : `updated client ${client.name}`;
    if (client.updated_at !== existing.updated_at) {
      await logActivity({
        project_id: null,
        actor_id: user.id,
        type: "client_updated",
        message,
        meta: {
          client_id: client.id,
          name: client.name,
          code: client.code,
          fields: Object.keys(parsed.data),
        },
      });
    }
    revalidate();
    return { ok: true, data: client };
  } catch (error) {
    return failure(error, "Could not save the client. Please try again.");
  }
}

/** Admin: deletes a client. Its projects keep existing without a client. */
export async function deleteClientAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, error: "Only admins can delete clients." };
  try {
    const existing = await getClient(id);
    if (!existing) return { ok: false, error: NOT_FOUND };
    await deleteClient(existing.id);
    await logActivity({
      project_id: null,
      actor_id: user.id,
      type: "client_deleted",
      message: `deleted client ${existing.name} (${existing.code})`,
      meta: { client_id: existing.id, name: existing.name, code: existing.code, projects: existing.project_count },
    });
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete the client. Please try again.");
  }
}

/** Member: a unique 2-6 character code for a client name (ClientDialog prefill). */
export async function suggestClientCodeAction(name: string): Promise<ActionResult<string>> {
  await requireUser();
  const parsed = clientNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Give the client a name." };
  try {
    return { ok: true, data: await suggestClientCode(parsed.data) };
  } catch (error) {
    return failure(error, "Could not suggest a code. Please type one.");
  }
}
