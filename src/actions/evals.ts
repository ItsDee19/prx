"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { EVAL_VERDICT_CONFIG } from "@/lib/constants";
import { logActivity } from "@/lib/data/activity";
import {
  EVAL_ERRORS,
  createEvalRun,
  deleteEvalRun,
  getEvalRun,
  promoteChampion,
  updateEvalRun,
  type CreateEvalRunFullInput,
  type UpdateEvalRunFullInput,
} from "@/lib/data/evals";
import { getProject } from "@/lib/data/projects";
import {
  createEvalRunSchema,
  evalRunIdSchema,
  promoteChampionSchema,
  updateEvalRunSchema,
  type UpdateEvalRunSchemaOutput,
} from "@/lib/schemas/evals";
import type { ActionResult, EvalRun, EvalRunWithMeta, PromoteChampionResult, User } from "@/lib/types";
import { fieldErrorsFromIssues } from "@/lib/validation";

const FIX_FIELDS = "Please fix the highlighted fields.";
const DELETE_FORBIDDEN = "Only the person who logged this run, the project owner or an admin can delete it.";

/** Data-layer messages that are safe (and useful) to show as they are. */
const USER_FACING_ERRORS: ReadonlySet<string> = new Set(Object.values(EVAL_ERRORS));

function revalidate(): void {
  revalidatePath("/", "layout");
}

function validationFailure(fieldErrors: Record<string, string>): ActionResult<never> {
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : FIX_FIELDS, fieldErrors };
}

function failure(error: unknown, message: string): ActionResult<never> {
  if (error instanceof Error && USER_FACING_ERRORS.has(error.message)) {
    return { ok: false, error: error.message };
  }
  console.error(message, error);
  return { ok: false, error: message };
}

/** Copies only the keys UpdateEvalRunFullInput allows from the parsed data. */
function toUpdatePatch(data: UpdateEvalRunSchemaOutput): UpdateEvalRunFullInput {
  const patch: UpdateEvalRunFullInput = {};
  if (data.milestone_id !== undefined) patch.milestone_id = data.milestone_id;
  if (data.label !== undefined) patch.label = data.label;
  if (data.change_type !== undefined) patch.change_type = data.change_type;
  if (data.model_name !== undefined) patch.model_name = data.model_name;
  if (data.prompt_version !== undefined) patch.prompt_version = data.prompt_version;
  if (data.dataset_version !== undefined) patch.dataset_version = data.dataset_version;
  if (data.metrics !== undefined) patch.metrics = data.metrics;
  if (data.verdict !== undefined) patch.verdict = data.verdict;
  if (data.external_url !== undefined) patch.external_url = data.external_url;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.run_date !== undefined) patch.run_date = data.run_date;
  return patch;
}

function sameMetrics(a: Record<string, number>, b: Record<string, number>): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && b[key] === a[key]);
}

/** True when the patch would change anything on the run (run_date always counts). */
function patchChanges(existing: EvalRunWithMeta, patch: UpdateEvalRunFullInput): boolean {
  if (patch.run_date !== undefined) return true;
  if (patch.metrics !== undefined && !sameMetrics(existing.metrics, patch.metrics)) return true;
  const pairs: [unknown, unknown][] = [
    [patch.milestone_id, existing.milestone_id],
    [patch.label, existing.label],
    [patch.change_type, existing.change_type],
    [patch.model_name, existing.model_name],
    [patch.prompt_version, existing.prompt_version],
    [patch.dataset_version, existing.dataset_version],
    [patch.verdict, existing.verdict],
    [patch.external_url, existing.external_url],
    [patch.notes, existing.notes],
  ];
  return pairs.some(([next, current]) => next !== undefined && next !== current);
}

async function canDeleteRun(user: User, run: EvalRun): Promise<boolean> {
  if (user.role === "admin" || run.created_by === user.id) return true;
  const project = await getProject(run.project_id);
  return project !== null && project.owner_id === user.id;
}

/* -------------------------------- Actions -------------------------------- */

/** Member. Logs `eval_logged`. */
export async function createEvalRunAction(input: CreateEvalRunFullInput): Promise<ActionResult<EvalRun>> {
  const user = await requireUser();
  const parsed = createEvalRunSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));
  const data = parsed.data;

  try {
    const run = await createEvalRun(
      {
        project_id: data.project_id,
        milestone_id: data.milestone_id,
        label: data.label,
        change_type: data.change_type,
        model_name: data.model_name,
        prompt_version: data.prompt_version,
        dataset_version: data.dataset_version,
        metrics: data.metrics,
        verdict: data.verdict,
        external_url: data.external_url,
        notes: data.notes,
        run_date: data.run_date,
      },
      user.id,
    );
    const count = Object.keys(run.metrics).length;
    await logActivity({
      project_id: run.project_id,
      actor_id: user.id,
      type: "eval_logged",
      message: `logged eval run "${run.label}" with ${count} ${count === 1 ? "metric" : "metrics"}`,
      meta: { eval_run_id: run.id, label: run.label, change_type: run.change_type, verdict: run.verdict },
    });
    revalidate();
    return { ok: true, data: run };
  } catch (error) {
    return failure(error, "Could not log the run. Please try again.");
  }
}

/** Member. Logs `eval_updated`. */
export async function updateEvalRunAction(
  id: string,
  input: UpdateEvalRunFullInput,
): Promise<ActionResult<EvalRun>> {
  const user = await requireUser();
  const idParsed = evalRunIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: EVAL_ERRORS.notFound };
  const parsed = updateEvalRunSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const existing = await getEvalRun(idParsed.data);
    if (!existing) return { ok: false, error: EVAL_ERRORS.notFound };
    const patch = toUpdatePatch(parsed.data);
    if (!patchChanges(existing, patch)) return { ok: true, data: existing };
    const updated = await updateEvalRun(existing.id, patch);

    const verdictChanged = updated.verdict !== existing.verdict;
    const onlyVerdict =
      verdictChanged &&
      Object.keys(patch).every((key) => key === "verdict" || key === "label") &&
      updated.label === existing.label;
    const demoted = verdictChanged && existing.verdict === "champion";
    const message = onlyVerdict
      ? demoted
        ? `demoted champion "${updated.label}" to ${EVAL_VERDICT_CONFIG[updated.verdict].label.toLowerCase()}`
        : `marked eval run "${updated.label}" as ${EVAL_VERDICT_CONFIG[updated.verdict].label.toLowerCase()}`
      : updated.label !== existing.label
        ? `updated eval run "${updated.label}" (was "${existing.label}")`
        : `updated eval run "${updated.label}"`;
    await logActivity({
      project_id: updated.project_id,
      actor_id: user.id,
      type: "eval_updated",
      message,
      meta: {
        eval_run_id: updated.id,
        label: updated.label,
        ...(verdictChanged ? { from: existing.verdict, to: updated.verdict } : {}),
      },
    });
    revalidate();
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error, "Could not save the run. Please try again.");
  }
}

/** Creator, project owner or admin. Logs `eval_deleted`. */
export async function deleteEvalRunAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = evalRunIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: EVAL_ERRORS.notFound };

  try {
    const existing = await getEvalRun(idParsed.data);
    if (!existing) return { ok: false, error: EVAL_ERRORS.notFound };
    if (!(await canDeleteRun(user, existing))) return { ok: false, error: DELETE_FORBIDDEN };
    const deleted = await deleteEvalRun(existing.id);
    await logActivity({
      project_id: deleted.project_id,
      actor_id: user.id,
      type: "eval_deleted",
      message:
        existing.verdict === "champion"
          ? `deleted champion eval run "${deleted.label}"`
          : `deleted eval run "${deleted.label}"`,
      meta: { eval_run_id: existing.id, label: deleted.label, verdict: existing.verdict },
    });
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete the run. Please try again.");
  }
}

/** Member. Archives the previous champion; optionally pushes values into the scorecard. Logs `champion_promoted`. */
export async function promoteChampionAction(
  id: string,
  input: { update_scorecard: boolean },
): Promise<ActionResult<PromoteChampionResult>> {
  const user = await requireUser();
  const idParsed = evalRunIdSchema.safeParse(id);
  if (!idParsed.success) return { ok: false, error: EVAL_ERRORS.notFound };
  const parsed = promoteChampionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(fieldErrorsFromIssues(parsed.error.issues));

  try {
    const result = await promoteChampion(idParsed.data, { updateScorecard: parsed.data.update_scorecard });
    const { champion, metrics_updated: updated } = result;
    const scorecardNote =
      parsed.data.update_scorecard && updated > 0
        ? ` and updated ${updated} scorecard ${updated === 1 ? "metric" : "metrics"}`
        : "";
    await logActivity({
      project_id: champion.project_id,
      actor_id: user.id,
      type: "champion_promoted",
      message: `promoted "${champion.label}" to champion${scorecardNote}`,
      meta: {
        eval_run_id: champion.id,
        label: champion.label,
        archived_id: result.archived_id,
        metrics_updated: updated,
      },
    });
    revalidate();
    return { ok: true, data: result };
  } catch (error) {
    return failure(error, "Could not promote the run. Please try again.");
  }
}
