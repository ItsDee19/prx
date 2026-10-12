"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getWorkspaceToday } from "@/lib/data/app-settings";
import { notifySafely } from "@/lib/data/notifications";
import {
  TIME_ERRORS,
  deleteTimeEntry,
  discardTimer,
  getBudgetPeriodMinutes,
  getRunningTimer,
  getTimeEntry,
  listTimeEntries,
  logTime,
  notifyBudgetThreshold,
  setTimesheetCell,
  setUserCostRate,
  setUserWeeklyCapacity,
  startTimer,
  stopTimer,
  undoStopTimer,
  updateTimeEntry,
} from "@/lib/data/time";
import { getUserById } from "@/lib/data/users";
import {
  capacitySchema,
  costRateSchema,
  logTimeSchema,
  startTimerSchema,
  timeIdSchema,
  timesheetCellSchema,
  updateTimeEntrySchema,
} from "@/lib/schemas/time";
import type {
  ActionResult,
  LogTimeInput,
  RunningTimer,
  StartTimerInput,
  TimeEntry,
  TimeEntryWithMeta,
  TimesheetCellInput,
  UpdateTimeEntryInput,
} from "@/lib/types";
import { fieldErrorsFromIssues } from "@/lib/validation";

/*
 * Time tracking actions (SPEC.md section 18.4). Time entries and timers are
 * personal records and log no activity (section 23.1). Every write that can
 * add minutes checks the budget thresholds afterwards and notifies the
 * project owner and admins (budget_threshold, deduped per period).
 */

const FIX_FIELDS = "Please fix the highlighted fields.";
const NOT_YOURS = "You can only change your own time entries.";
const ADMIN_ONLY = "Only admins can do that.";
const COMMERCIAL_ONLY = "Only admins can change commercial fields.";
const USER_FACING_ERRORS: ReadonlySet<string> = new Set(Object.values(TIME_ERRORS));

function revalidate(): void {
  revalidatePath("/", "layout");
}

function validationFailure(issues: Parameters<typeof fieldErrorsFromIssues>[0]): ActionResult<never> {
  const fieldErrors = fieldErrorsFromIssues(issues);
  const messages = Object.values(fieldErrors);
  return { ok: false, error: messages.length === 1 ? messages[0] : FIX_FIELDS, fieldErrors };
}

function failure(error: unknown, message: string): ActionResult<never> {
  if (error instanceof Error && USER_FACING_ERRORS.has(error.message)) return { ok: false, error: error.message };
  console.error(message, error);
  return { ok: false, error: message };
}

/** Budget-period minutes per project before a write (projects without a budget are skipped). */
async function budgetSnapshot(projectIds: (string | null | undefined)[], today: string): Promise<Map<string, number>> {
  const unique = [...new Set(projectIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  const snapshot = new Map<string, number>();
  await Promise.all(
    unique.map(async (projectId) => {
      const minutes = await getBudgetPeriodMinutes(projectId, today);
      if (minutes !== null) snapshot.set(projectId, minutes);
    }),
  );
  return snapshot;
}

/** After the write: notify for every budgeted project whose threshold was newly crossed. */
async function notifyBudgetCrossings(snapshot: Map<string, number>, today: string, scope: string): Promise<void> {
  if (snapshot.size === 0) return;
  await notifySafely(scope, () =>
    Promise.all([...snapshot].map(([projectId, before]) => notifyBudgetThreshold(projectId, today, before))),
  );
}

/* -------------------------------- Timers -------------------------------- */

/** The signed-in user's running timer (topbar refresh on focus). */
export async function getRunningTimerAction(): Promise<ActionResult<RunningTimer | null>> {
  const user = await requireUser();
  try {
    return { ok: true, data: await getRunningTimer(user.id) };
  } catch (error) {
    return failure(error, "Could not load your timer.");
  }
}

/** Starts a timer (stopping and logging a running one first: "switch task"). Own timer only. */
export async function startTimerAction(input: StartTimerInput): Promise<ActionResult<RunningTimer>> {
  const user = await requireUser();
  const parsed = startTimerSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues);

  try {
    const today = await getWorkspaceToday();
    const running = await getRunningTimer(user.id);
    const snapshot = await budgetSnapshot([running?.project_id], today);
    const { timer } = await startTimer(
      user.id,
      { project_id: parsed.data.project_id, task_id: parsed.data.task_id ?? null, note: parsed.data.note ?? "" },
      today,
    );
    await notifyBudgetCrossings(snapshot, today, "startTimerAction");
    revalidate();
    return { ok: true, data: timer };
  } catch (error) {
    return failure(error, "Could not start the timer.");
  }
}

/** Stops the running timer and logs the entry (null when none was running). Own timer only. */
export async function stopTimerAction(): Promise<ActionResult<{ entry: TimeEntry; timer_id: string } | null>> {
  const user = await requireUser();
  try {
    const today = await getWorkspaceToday();
    const running = await getRunningTimer(user.id);
    if (!running) return { ok: true, data: null };
    const snapshot = await budgetSnapshot([running.project_id], today);
    const result = await stopTimer(user.id, today);
    if (!result) return { ok: true, data: null };
    await notifyBudgetCrossings(snapshot, today, "stopTimerAction");
    revalidate();
    return { ok: true, data: { entry: result.entry, timer_id: result.timer.id } };
  } catch (error) {
    return failure(error, "Could not stop the timer.");
  }
}

/** Undo a stop: removes the logged entry and resumes the timer. Own timer only. */
export async function undoStopTimerAction(timerId: string): Promise<ActionResult<RunningTimer>> {
  const user = await requireUser();
  const parsed = timeIdSchema.safeParse(timerId);
  if (!parsed.success) return { ok: false, error: TIME_ERRORS.undoUnavailable };
  try {
    const timer = await undoStopTimer(user.id, parsed.data);
    revalidate();
    return { ok: true, data: timer };
  } catch (error) {
    return failure(error, "Could not undo. The entry is still logged.");
  }
}

/** Throws the running timer away without logging time. Own timer only. */
export async function discardTimerAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await discardTimer(user.id);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not discard the timer.");
  }
}

/* ----------------------------- Time entries ----------------------------- */

/** Logs time for the signed-in member. */
export async function logTimeAction(input: LogTimeInput): Promise<ActionResult<TimeEntry>> {
  const user = await requireUser();
  const parsed = logTimeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues);
  const data = parsed.data;

  try {
    const today = await getWorkspaceToday();
    const snapshot = await budgetSnapshot([data.project_id], today);
    const entry = await logTime(user.id, {
      project_id: data.project_id,
      task_id: data.task_id ?? null,
      entry_date: data.entry_date,
      minutes: data.minutes,
      billable: data.billable,
      note: data.note ?? "",
      source: "manual",
    });
    await notifyBudgetCrossings(snapshot, today, "logTimeAction");
    revalidate();
    return { ok: true, data: entry };
  } catch (error) {
    return failure(error, "Could not log the time.");
  }
}

/** Edits an entry. Entry owner or admin. */
export async function updateTimeEntryAction(id: string, input: UpdateTimeEntryInput): Promise<ActionResult<TimeEntry>> {
  const user = await requireUser();
  const parsedId = timeIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: TIME_ERRORS.entryMissing };
  const parsed = updateTimeEntrySchema.safeParse(input ?? {});
  if (!parsed.success) return validationFailure(parsed.error.issues);
  const data = parsed.data;

  try {
    const existing = await getTimeEntry(parsedId.data);
    if (!existing) return { ok: false, error: TIME_ERRORS.entryMissing };
    if (existing.user_id !== user.id && user.role !== "admin") return { ok: false, error: NOT_YOURS };

    const patch: UpdateTimeEntryInput = {};
    if (data.project_id !== undefined) patch.project_id = data.project_id;
    if (data.task_id !== undefined) patch.task_id = data.task_id;
    if (data.entry_date !== undefined) patch.entry_date = data.entry_date;
    if (data.minutes !== undefined) patch.minutes = data.minutes;
    if (data.billable !== undefined) patch.billable = data.billable;
    if (data.note !== undefined) patch.note = data.note;

    const today = await getWorkspaceToday();
    const snapshot = await budgetSnapshot([patch.project_id ?? existing.project_id], today);
    const entry = await updateTimeEntry(existing.id, patch);
    await notifyBudgetCrossings(snapshot, today, "updateTimeEntryAction");
    revalidate();
    return { ok: true, data: entry };
  } catch (error) {
    return failure(error, "Could not update the entry.");
  }
}

/** Deletes an entry. Entry owner or admin. */
export async function deleteTimeEntryAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsedId = timeIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: TIME_ERRORS.entryMissing };
  try {
    const existing = await getTimeEntry(parsedId.data);
    if (!existing) return { ok: false, error: TIME_ERRORS.entryMissing };
    if (existing.user_id !== user.id && user.role !== "admin") return { ok: false, error: NOT_YOURS };
    await deleteTimeEntry(existing.id);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not delete the entry.");
  }
}

/** Entries logged against a task, newest first (task drawer time section). Member. */
export async function listTaskTimeEntriesAction(taskId: string): Promise<ActionResult<TimeEntryWithMeta[]>> {
  await requireUser();
  const parsedId = timeIdSchema.safeParse(taskId);
  if (!parsedId.success) return { ok: false, error: TIME_ERRORS.taskMissing };
  try {
    return { ok: true, data: await listTimeEntries({ taskId: parsedId.data, limit: 50 }) };
  } catch (error) {
    return failure(error, "Could not load the time entries.");
  }
}

/* ------------------------------- Timesheet ------------------------------ */

/**
 * Sets one timesheet cell's total. Your own sheet, or another user's when
 * you are an admin.
 */
export async function setTimesheetCellAction(input: TimesheetCellInput, userId?: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = timesheetCellSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error.issues);

  let targetId = user.id;
  if (userId !== undefined && userId !== user.id) {
    if (user.role !== "admin") return { ok: false, error: "Only admins can edit someone else's timesheet." };
    const parsedUser = timeIdSchema.safeParse(userId);
    if (!parsedUser.success) return { ok: false, error: TIME_ERRORS.userMissing };
    const target = await getUserById(parsedUser.data);
    if (!target) return { ok: false, error: TIME_ERRORS.userMissing };
    targetId = target.id;
  }

  try {
    const today = await getWorkspaceToday();
    const snapshot = await budgetSnapshot([parsed.data.project_id], today);
    await setTimesheetCell(targetId, {
      project_id: parsed.data.project_id,
      task_id: parsed.data.task_id ?? null,
      entry_date: parsed.data.entry_date,
      minutes: parsed.data.minutes,
    });
    await notifyBudgetCrossings(snapshot, today, "setTimesheetCellAction");
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not save the timesheet.");
  }
}

/* ------------------------- Capacity and cost rates ---------------------- */

/** Sets someone's weekly capacity in hours. Admin. */
export async function setUserCapacityAction(userId: string, hours: number): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, error: ADMIN_ONLY };
  const parsedId = timeIdSchema.safeParse(userId);
  if (!parsedId.success) return { ok: false, error: TIME_ERRORS.userMissing };
  const parsed = capacitySchema.safeParse(hours);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? TIME_ERRORS.capacityRange };
  try {
    await setUserWeeklyCapacity(parsedId.data, parsed.data);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not update the capacity.");
  }
}

/** Sets or clears someone's internal cost rate (INR per hour). Admin (commercial field). */
export async function setUserCostRateAction(userId: string, rate: number | null): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "admin") return { ok: false, error: COMMERCIAL_ONLY };
  const parsedId = timeIdSchema.safeParse(userId);
  if (!parsedId.success) return { ok: false, error: TIME_ERRORS.userMissing };
  const parsed = costRateSchema.safeParse(rate);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? TIME_ERRORS.costRateRange };
  try {
    await setUserCostRate(parsedId.data, parsed.data);
    revalidate();
    return { ok: true, data: undefined };
  } catch (error) {
    return failure(error, "Could not update the cost rate.");
  }
}
