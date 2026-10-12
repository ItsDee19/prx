/**
 * Engagement templates: the data module (SPEC.md section 17.6). Built-in
 * templates are code constants in `src/lib/templates.ts`; custom ones live in
 * `project_templates`. Applying a template runs inside the createProject
 * transaction (`afterInsert`), with raw SQL on the transaction only.
 *
 * Templates never carry commercial data (no amounts, prices or invoice
 * states), so capturing and applying them cannot leak admin-only fields.
 */
import { db, newId, nowISO, transaction, type Queryable } from "@/lib/db";
import { HANDOVER_PHASE_KEY, MAX_SUCCESS_METRICS, OPEN_RISK_STATUSES, TASK_POSITION_STEP } from "@/lib/constants";
import { templatePayloadSchema, TEMPLATE_MAX_LABELS } from "@/lib/schemas/templates";
import {
  BUILTIN_TEMPLATE_OPTIONS,
  computeTemplateSchedule,
  customTemplateOption,
  getBuiltinTemplate,
  parseTemplateKey,
  templateKeyFor,
  type TemplateOption,
} from "@/lib/templates";
import type {
  CreateProjectFullInput,
  CreateProjectTemplateInput,
  MilestoneKind,
  Project,
  ProjectQueryOptions,
  ProjectTemplate,
  ServiceLine,
  TemplateMilestone,
  TemplatePayload,
  TemplateTask,
  UpdateProjectTemplateInput,
} from "@/lib/types";
import { addDaysISO, dateInTimeZone, diffDaysISO, tuningEndDate } from "@/lib/workspace-time";
import { getWorkspaceTimezone } from "./app-settings";
import { findOrCreateLabelsByName, setProjectLabels } from "./labels";
import { createProject, getProject } from "./projects";
import { recomputeProjectProgress } from "./tasks";

/** User-facing messages the actions pass through unchanged. */
export const TEMPLATE_ERRORS = {
  notFound: "This template no longer exists.",
  damaged: "This template is damaged and cannot be used. Ask an admin to delete it.",
  projectNotFound: "This project no longer exists.",
  duplicateName: "A template with this name already exists.",
  notAssessment: "Only an AI readiness assessment or consulting engagement can be converted into a pilot.",
  planNotDone: "Finish the Plan phase before converting to a pilot.",
  alreadyRetainer: "This engagement is already a retainer.",
} as const;

/** Built-in key of the template a pilot is created from. */
export const PILOT_TEMPLATE_KEY = templateKeyFor("builtin", "ai_delivery");
/** Built-in key of the template a retainer proposal is created from. */
export const RETAINER_TEMPLATE_KEY = templateKeyFor("builtin", "retainer");
/** Built-in key of the readiness assessment (with the consulting service line: "assessment"). */
export const ASSESSMENT_TEMPLATE_KEY = templateKeyFor("builtin", "ai_readiness");
/** Phase whose completion unlocks Convert to pilot. */
export const PLAN_PHASE_KEY = "plan";

/* --------------------------------- Rows -------------------------------- */

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  service_line: ServiceLine | null;
  payload: unknown;
  source_project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_COLUMNS = `id, name, description, service_line, payload, source_project_id, created_by, created_at, updated_at`;

/** An empty payload, used to list a damaged custom template so an admin can still delete it. */
function emptyPayload(): TemplatePayload {
  return {
    progress_mode: "tasks",
    engagement_type: null,
    service_line: null,
    delivery_state: "not_started",
    budget_period: "total",
    tuning_days: 0,
    milestones: [],
    metrics: [],
    risks: [],
    label_names: [],
  };
}

/** The validated payload, or null when the stored JSON does not match TemplatePayload. */
function readPayload(raw: unknown): TemplatePayload | null {
  const parsed = templatePayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function readTemplate(row: TemplateRow): { template: ProjectTemplate; damaged: boolean } {
  const payload = readPayload(row.payload);
  return {
    template: {
      id: row.id,
      name: row.name,
      description: row.description,
      service_line: row.service_line,
      payload: payload ?? emptyPayload(),
      source_project_id: row.source_project_id,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    damaged: payload === null,
  };
}

function toTemplate(row: TemplateRow): ProjectTemplate {
  return readTemplate(row).template;
}

/** A custom template plus the facts the settings manager shows. */
export interface CustomTemplateWithMeta extends ProjectTemplate {
  /** true when the stored payload is unreadable (it is listed so an admin can delete it). */
  damaged: boolean;
  creator_name: string | null;
  source_project_name: string | null;
  /** Projects created from this template (projects.template_key). */
  usage_count: number;
}

/* -------------------------------- Reads -------------------------------- */

/** Built-in options in their fixed order, then custom templates by name. */
export async function listTemplateOptions(): Promise<TemplateOption[]> {
  const custom = await listCustomTemplates();
  return [...BUILTIN_TEMPLATE_OPTIONS, ...custom.map(customTemplateOption)];
}

/** Custom templates with a readable payload, by name. */
export async function listCustomTemplates(): Promise<ProjectTemplate[]> {
  const rows = await db.query<TemplateRow>(
    `SELECT ${TEMPLATE_COLUMNS} FROM project_templates ORDER BY lower(name) ASC, created_at ASC`,
  );
  return rows
    .map(readTemplate)
    .filter((entry) => !entry.damaged)
    .map((entry) => entry.template);
}

/** Every custom template (damaged ones included) with creator, source project and usage, by name. */
export async function listCustomTemplatesWithMeta(): Promise<CustomTemplateWithMeta[]> {
  const rows = await db.query<TemplateRow & { creator_name: string | null; source_project_name: string | null; usage_count: number }>(
    `SELECT t.id, t.name, t.description, t.service_line, t.payload, t.source_project_id, t.created_by,
            t.created_at, t.updated_at,
            u.name AS creator_name, sp.name AS source_project_name,
            (SELECT COUNT(*)::int FROM projects p WHERE p.template_key = 'custom:' || t.id) AS usage_count
       FROM project_templates t
       LEFT JOIN users u ON u.id = t.created_by
       LEFT JOIN projects sp ON sp.id = t.source_project_id
      ORDER BY lower(t.name) ASC, t.created_at ASC`,
  );
  return rows.map((row) => {
    const { template, damaged } = readTemplate(row);
    return {
      ...template,
      damaged,
      creator_name: row.creator_name,
      source_project_name: row.source_project_name,
      usage_count: row.usage_count,
    };
  });
}

export async function getCustomTemplate(id: string): Promise<ProjectTemplate | null> {
  const row = await db.queryOne<TemplateRow>(`SELECT ${TEMPLATE_COLUMNS} FROM project_templates WHERE id = $1`, [id]);
  return row ? toTemplate(row) : null;
}

/** A template resolved from its key: built-in or custom, with its display name. */
export interface ResolvedTemplate {
  key: string;
  source: "builtin" | "custom";
  name: string;
  /** Service lines the template is offered for (first = default suggestion). */
  service_lines: ServiceLine[];
  payload: TemplatePayload;
}

/** null when the key is malformed, the custom template was deleted, or its payload is unreadable. */
export async function resolveTemplate(templateKey: string): Promise<ResolvedTemplate | null> {
  const parsed = parseTemplateKey(templateKey);
  if (!parsed) return null;
  if (parsed.source === "builtin") {
    const builtin = getBuiltinTemplate(parsed.id);
    if (!builtin) return null;
    return {
      key: templateKeyFor("builtin", builtin.key),
      source: "builtin",
      name: builtin.name,
      service_lines: [...builtin.service_lines],
      payload: builtin.payload,
    };
  }
  const row = await db.queryOne<TemplateRow>(`SELECT ${TEMPLATE_COLUMNS} FROM project_templates WHERE id = $1`, [
    parsed.id,
  ]);
  if (!row) return null;
  const payload = readPayload(row.payload);
  if (!payload) return null;
  return {
    key: templateKeyFor("custom", row.id),
    source: "custom",
    name: row.name,
    service_lines: row.service_line ? [row.service_line] : [],
    payload,
  };
}

/** The payload behind "builtin:<key>" / "custom:<id>", or null. */
export async function getTemplatePayload(templateKey: string): Promise<TemplatePayload | null> {
  return (await resolveTemplate(templateKey))?.payload ?? null;
}

/* ------------------------------ Custom CRUD ----------------------------- */

async function assertUniqueName(name: string, exceptId: string | null, q: Queryable): Promise<void> {
  const clash = await q.queryOne<{ id: string }>(
    `SELECT id FROM project_templates WHERE lower(name) = lower($1) AND ($2::text IS NULL OR id <> $2) LIMIT 1`,
    [name, exceptId],
  );
  if (clash) throw new Error(TEMPLATE_ERRORS.duplicateName);
}

/** Validates the payload (TemplatePayload shape); names are unique case-insensitively. */
export async function createCustomTemplate(input: CreateProjectTemplateInput, userId: string): Promise<ProjectTemplate> {
  const payload = templatePayloadSchema.parse(input.payload);
  const name = input.name.trim();
  const now = nowISO();
  return transaction(async (tx) => {
    await assertUniqueName(name, null, tx);
    const row = await tx.queryOne<TemplateRow>(
      `INSERT INTO project_templates (id, name, description, service_line, payload, source_project_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $8)
       RETURNING ${TEMPLATE_COLUMNS}`,
      [
        newId(),
        name,
        (input.description ?? "").trim(),
        input.service_line ?? null,
        JSON.stringify(payload),
        input.source_project_id ?? null,
        userId,
        now,
      ],
    );
    if (!row) throw new Error("Could not save the template.");
    return toTemplate(row);
  });
}

/** Name, description and service line only (the payload is fixed once captured). */
export async function updateCustomTemplate(id: string, patch: UpdateProjectTemplateInput): Promise<ProjectTemplate> {
  return transaction(async (tx) => {
    const existing = await tx.queryOne<TemplateRow>(
      `SELECT ${TEMPLATE_COLUMNS} FROM project_templates WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!existing) throw new Error(TEMPLATE_ERRORS.notFound);
    const name = patch.name !== undefined ? patch.name.trim() : existing.name;
    if (patch.name !== undefined && name.toLowerCase() !== existing.name.toLowerCase()) {
      await assertUniqueName(name, id, tx);
    }
    const row = await tx.queryOne<TemplateRow>(
      `UPDATE project_templates
          SET name = $2, description = $3, service_line = $4, updated_at = $5
        WHERE id = $1
        RETURNING ${TEMPLATE_COLUMNS}`,
      [
        id,
        name,
        patch.description !== undefined ? patch.description.trim() : existing.description,
        patch.service_line !== undefined ? patch.service_line : existing.service_line,
        nowISO(),
      ],
    );
    if (!row) throw new Error(TEMPLATE_ERRORS.notFound);
    return toTemplate(row);
  });
}

/** Projects created from it keep their `template_key` (provenance only). */
export async function deleteCustomTemplate(id: string): Promise<void> {
  const removed = await db.execute("DELETE FROM project_templates WHERE id = $1", [id]);
  if (removed === 0) throw new Error(TEMPLATE_ERRORS.notFound);
}

/* -------------------------------- Capture ------------------------------- */

interface CaptureMilestoneRow {
  id: string;
  name: string;
  description: string;
  kind: MilestoneKind;
  phase_key: string | null;
  start_date: string | null;
  due_date: string | null;
  requires_gate: boolean;
}

interface CaptureTaskRow {
  id: string;
  milestone_id: string;
  title: string;
  description: string;
  is_deliverable: boolean;
  start_date: string | null;
  due_date: string | null;
  estimate_minutes: number | null;
}

function slugKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return slug || "phase";
}

function spanDays(start: string | null, due: string | null): number {
  if (start && due && due >= start) return diffDaysISO(start, due) + 1;
  return 1;
}

/**
 * The project's plan as a payload: phases and point milestones (by position)
 * with their top-level, non-cancelled tasks as day offsets from the project
 * start (`start_date`, else the earliest milestone/task date, else the created
 * date in the workspace timezone); the scorecard (targets kept, current values
 * dropped), open risks and the project's label names. Tasks without a phase
 * are not part of a template. Never reads commercial fields.
 */
export async function captureTemplateFromProject(projectId: string): Promise<TemplatePayload> {
  const project = await db.queryOne<
    Pick<
      Project,
      | "id"
      | "start_date"
      | "created_at"
      | "progress_mode"
      | "engagement_type"
      | "service_line"
      | "budget_period"
      | "tuning_days"
    >
  >(
    `SELECT id, start_date, created_at, progress_mode, engagement_type, service_line, budget_period, tuning_days
       FROM projects WHERE id = $1`,
    [projectId],
  );
  if (!project) throw new Error(TEMPLATE_ERRORS.projectNotFound);

  const [milestones, tasks, checklist, metrics, risks, labels, earliest, timeZone] = await Promise.all([
    db.query<CaptureMilestoneRow>(
      `SELECT id, name, description, kind, phase_key, start_date, due_date, requires_gate
         FROM milestones WHERE project_id = $1 ORDER BY position ASC, created_at ASC`,
      [projectId],
    ),
    db.query<CaptureTaskRow>(
      `SELECT id, milestone_id, title, description, is_deliverable, start_date, due_date, estimate_minutes
         FROM tasks
        WHERE project_id = $1 AND milestone_id IS NOT NULL AND parent_task_id IS NULL AND status <> 'cancelled'
        ORDER BY position ASC, number ASC`,
      [projectId],
    ),
    db.query<{ task_id: string; title: string }>(
      `SELECT c.task_id, c.title
         FROM task_checklist_items c
         JOIN tasks t ON t.id = c.task_id
        WHERE t.project_id = $1
        ORDER BY c.position ASC, c.created_at ASC`,
      [projectId],
    ),
    db.query<{ name: string; unit: string; direction: "higher" | "lower"; baseline: number | null; target: number }>(
      `SELECT name, unit, direction, baseline, target FROM success_metrics
        WHERE project_id = $1 ORDER BY position ASC, created_at ASC LIMIT $2`,
      [projectId, MAX_SUCCESS_METRICS],
    ),
    db.query<{
      kind: TemplatePayload["risks"][number]["kind"];
      category: TemplatePayload["risks"][number]["category"];
      title: string;
      description: string;
      likelihood: number | null;
      impact: number | null;
      mitigation: string;
    }>(
      `SELECT kind, category, title, description, likelihood, impact, mitigation FROM risks
        WHERE project_id = $1 AND status = ANY($2::text[])
        ORDER BY created_at ASC LIMIT 50`,
      [projectId, OPEN_RISK_STATUSES],
    ),
    db.query<{ name: string }>(
      `SELECT l.name FROM project_labels pl JOIN labels l ON l.id = pl.label_id
        WHERE pl.project_id = $1 ORDER BY lower(l.name) LIMIT $2`,
      [projectId, TEMPLATE_MAX_LABELS],
    ),
    db.queryOne<{ earliest: string | null }>(
      `SELECT MIN(d) AS earliest FROM (
         SELECT COALESCE(start_date, due_date) AS d FROM milestones WHERE project_id = $1
         UNION ALL
         SELECT COALESCE(start_date, due_date) FROM tasks WHERE project_id = $1
       ) dates WHERE d IS NOT NULL`,
      [projectId],
    ),
    getWorkspaceTimezone(),
  ]);

  const base = project.start_date ?? earliest?.earliest ?? dateInTimeZone(project.created_at, timeZone);
  const offsetFrom = (from: string, date: string | null) => (date ? Math.max(0, diffDaysISO(from, date)) : 0);

  const checklistByTask = new Map<string, string[]>();
  for (const item of checklist) {
    const title = item.title.trim().slice(0, 200);
    if (!title) continue;
    const list = checklistByTask.get(item.task_id) ?? [];
    if (list.length < 50) list.push(title);
    checklistByTask.set(item.task_id, list);
  }
  const tasksByMilestone = new Map<string, CaptureTaskRow[]>();
  for (const task of tasks) {
    const list = tasksByMilestone.get(task.milestone_id) ?? [];
    list.push(task);
    tasksByMilestone.set(task.milestone_id, list);
  }

  const usedKeys = new Set<string>();
  const capturedMilestones: TemplateMilestone[] = milestones.slice(0, 40).map((milestone) => {
    let key = (milestone.phase_key ?? slugKey(milestone.name)).slice(0, 40);
    if (usedKeys.has(key)) {
      let n = 2;
      while (usedKeys.has(`${key.slice(0, 36)}_${n}`)) n += 1;
      key = `${key.slice(0, 36)}_${n}`;
    }
    usedKeys.add(key);
    const anchor = milestone.start_date ?? milestone.due_date ?? base;
    const isPoint = milestone.kind === "milestone";
    const capturedTasks: TemplateTask[] = (tasksByMilestone.get(milestone.id) ?? []).slice(0, 200).map((task) => {
      const start = task.start_date ?? task.due_date;
      return {
        title: task.title.slice(0, 200),
        ...(task.description.trim() ? { description: task.description.slice(0, 5000) } : {}),
        is_deliverable: task.is_deliverable,
        offset_days: offsetFrom(anchor, start),
        duration_days: spanDays(task.start_date ?? task.due_date, task.due_date ?? task.start_date),
        estimate_minutes: task.estimate_minutes,
        checklist: checklistByTask.get(task.id) ?? [],
      };
    });
    return {
      key,
      name: milestone.name.slice(0, 120),
      kind: milestone.kind,
      offset_days: offsetFrom(base, anchor),
      duration_days: isPoint ? 0 : spanDays(milestone.start_date ?? milestone.due_date, milestone.due_date),
      requires_gate: milestone.requires_gate,
      description: milestone.description.slice(0, 5000),
      ...(milestone.phase_key === HANDOVER_PHASE_KEY && !isPoint ? { is_tuning: true } : {}),
      tasks: capturedTasks,
    };
  });

  const payload: TemplatePayload = {
    progress_mode: project.progress_mode,
    engagement_type: project.engagement_type,
    service_line: project.service_line,
    delivery_state: project.engagement_type === "retainer" ? "production" : "not_started",
    budget_period: project.budget_period,
    tuning_days: project.tuning_days,
    milestones: capturedMilestones,
    metrics: metrics.map((metric) => ({
      name: metric.name.slice(0, 80),
      unit: metric.unit.slice(0, 20),
      direction: metric.direction,
      baseline: metric.baseline,
      target: metric.target,
    })),
    risks: risks.map((risk) => ({
      kind: risk.kind,
      category: risk.category,
      title: risk.title.slice(0, 200),
      ...(risk.description.trim() ? { description: risk.description.slice(0, 5000) } : {}),
      likelihood: risk.likelihood,
      impact: risk.impact,
      ...(risk.mitigation.trim() ? { mitigation: risk.mitigation.slice(0, 5000) } : {}),
    })),
    label_names: labels.map((label) => label.name.slice(0, 60)),
  };
  return templatePayloadSchema.parse(payload);
}

/* --------------------------------- Apply -------------------------------- */

export interface ApplyTemplateResult {
  milestones: number;
  tasks: number;
  metrics: number;
  risks: number;
}

/**
 * Writes the template's plan into an existing project, on `tx` only: phases
 * and point milestones (with `phase_key`; the first phase `active`, the rest
 * `planned`), tasks at the end of the To do column (checklists, deliverable
 * flags, estimates, `created_by = userId`), success metrics (names already on
 * the scorecard are skipped, at most MAX_SUCCESS_METRICS in all), open risks
 * (owned by the project owner, first review at the end of the first phase)
 * and the payload's labels added to the project's. Dates come from
 * `computeTemplateSchedule(payload, startDate)`, so they match the dialog
 * preview exactly. Recomputes progress once at the end.
 */
export async function applyTemplate(
  tx: Queryable,
  projectId: string,
  payload: TemplatePayload,
  startDate: string,
  userId: string,
): Promise<ApplyTemplateResult> {
  const now = nowISO();
  const schedule = computeTemplateSchedule(payload, startDate);

  const project = await tx.queryOne<{ owner_id: string | null }>("SELECT owner_id FROM projects WHERE id = $1", [projectId]);
  if (!project) throw new Error(TEMPLATE_ERRORS.projectNotFound);

  const positions = await tx.queryOne<{ milestone_next: number; task_last: number | null }>(
    `SELECT (SELECT COALESCE(MAX(position), -1) + 1 FROM milestones WHERE project_id = $1)::int AS milestone_next,
            (SELECT MAX(position) FROM tasks WHERE project_id = $1 AND status = 'todo')::float8 AS task_last`,
    [projectId],
  );
  const milestoneBase = positions?.milestone_next ?? 0;
  let taskPosition = positions?.task_last ?? 0;

  /* Milestones and phases. */
  const firstPhaseIndex = schedule.milestones.findIndex((milestone) => milestone.kind === "phase");
  const milestoneRows = schedule.milestones.map((milestone, index) => ({
    id: newId(),
    name: milestone.name,
    description: milestone.description,
    kind: milestone.kind,
    phase_key: milestone.key,
    position: milestoneBase + index,
    start_date: milestone.start_date,
    due_date: milestone.due_date,
    status: index === firstPhaseIndex ? "active" : "planned",
    requires_gate: milestone.requires_gate,
  }));
  if (milestoneRows.length > 0) {
    await tx.execute(
      `INSERT INTO milestones (id, project_id, name, description, kind, phase_key, position, start_date, due_date,
                               status, requires_gate, created_at, updated_at)
       SELECT r.id, $2, r.name, r.description, r.kind, r.phase_key, r.position, r.start_date, r.due_date,
              r.status, r.requires_gate, $3, $3
         FROM jsonb_to_recordset($1::jsonb) AS r(id text, name text, description text, kind text, phase_key text,
                                                 position int, start_date text, due_date text, status text,
                                                 requires_gate boolean)`,
      [JSON.stringify(milestoneRows), projectId, now],
    );
  }

  /* Tasks (template order, so task numbers follow the plan) and their checklists. */
  const taskRows: {
    ord: number;
    id: string;
    milestone_id: string;
    title: string;
    description: string;
    start_date: string;
    due_date: string;
    estimate_minutes: number | null;
    is_deliverable: boolean;
    position: number;
  }[] = [];
  const checklistRows: { id: string; task_id: string; title: string; position: number }[] = [];
  schedule.milestones.forEach((milestone, index) => {
    for (const task of milestone.tasks) {
      taskPosition += TASK_POSITION_STEP;
      const id = newId();
      taskRows.push({
        ord: taskRows.length,
        id,
        milestone_id: milestoneRows[index].id,
        title: task.title,
        description: task.description,
        start_date: task.start_date,
        due_date: task.due_date,
        estimate_minutes: task.estimate_minutes,
        is_deliverable: task.is_deliverable,
        position: taskPosition,
      });
      task.checklist.forEach((title, position) => {
        checklistRows.push({ id: newId(), task_id: id, title, position });
      });
    }
  });
  if (taskRows.length > 0) {
    await tx.execute(
      `INSERT INTO tasks (id, project_id, milestone_id, title, description, status, priority, start_date, due_date,
                          estimate_minutes, is_deliverable, position, created_by, created_at, updated_at)
       SELECT r.id, $2, r.milestone_id, r.title, r.description, 'todo', 'medium', r.start_date, r.due_date,
              r.estimate_minutes, r.is_deliverable, r.position, $3, $4, $4
         FROM jsonb_to_recordset($1::jsonb) AS r(ord int, id text, milestone_id text, title text, description text,
                                                 start_date text, due_date text, estimate_minutes int,
                                                 is_deliverable boolean, position float8)
        ORDER BY r.ord`,
      [JSON.stringify(taskRows), projectId, userId, now],
    );
  }
  if (checklistRows.length > 0) {
    await tx.execute(
      `INSERT INTO task_checklist_items (id, task_id, title, done, position, completed_at, created_at, updated_at)
       SELECT r.id, r.task_id, r.title, FALSE, r.position, NULL, $2, $2
         FROM jsonb_to_recordset($1::jsonb) AS r(id text, task_id text, title text, position int)`,
      [JSON.stringify(checklistRows), now],
    );
  }

  /* Success metrics: skip names already on the scorecard; never exceed the per-project cap. */
  const existingMetrics = await tx.query<{ name: string; position: number }>(
    "SELECT name, position FROM success_metrics WHERE project_id = $1",
    [projectId],
  );
  const takenNames = new Set(existingMetrics.map((metric) => metric.name.trim().toLowerCase()));
  let metricPosition = existingMetrics.reduce((max, metric) => Math.max(max, metric.position), -1);
  const room = Math.max(0, MAX_SUCCESS_METRICS - existingMetrics.length);
  const metricRows: { id: string; name: string; unit: string; direction: string; baseline: number | null; target: number; position: number }[] = [];
  for (const metric of payload.metrics) {
    if (metricRows.length >= room) break;
    const key = metric.name.trim().toLowerCase();
    if (!key || takenNames.has(key)) continue;
    takenNames.add(key);
    metricPosition += 1;
    metricRows.push({
      id: newId(),
      name: metric.name.trim(),
      unit: metric.unit,
      direction: metric.direction,
      baseline: metric.baseline ?? null,
      target: metric.target,
      position: metricPosition,
    });
  }
  if (metricRows.length > 0) {
    await tx.execute(
      `INSERT INTO success_metrics (id, project_id, name, unit, direction, baseline, target, position, notes, created_at, updated_at)
       SELECT r.id, $2, r.name, r.unit, r.direction, r.baseline, r.target, r.position, '', $3, $3
         FROM jsonb_to_recordset($1::jsonb) AS r(id text, name text, unit text, direction text, baseline float8,
                                                 target float8, position int)
       ON CONFLICT (project_id, (lower(name))) DO NOTHING`,
      [JSON.stringify(metricRows), projectId, now],
    );
  }

  /* Starter risks: reviewed at the end of the first phase (or a week in). */
  const firstReview = schedule.milestones.find((milestone) => milestone.kind === "phase")?.due_date ?? addDaysISO(startDate, 7);
  const riskRows = payload.risks.map((risk) => ({
    id: newId(),
    kind: risk.kind,
    category: risk.category,
    title: risk.title,
    description: risk.description ?? "",
    likelihood: risk.likelihood ?? null,
    impact: risk.impact ?? null,
    mitigation: risk.mitigation ?? "",
  }));
  if (riskRows.length > 0) {
    await tx.execute(
      `INSERT INTO risks (id, project_id, kind, category, title, description, likelihood, impact, owner_id, mitigation,
                          status, review_date, due_date, created_by, created_at, updated_at, closed_at)
       SELECT r.id, $2, r.kind, r.category, r.title, r.description, r.likelihood, r.impact, $3, r.mitigation,
              'open', $4, NULL, $5, $6, $6, NULL
         FROM jsonb_to_recordset($1::jsonb) AS r(id text, kind text, category text, title text, description text,
                                                 likelihood smallint, impact smallint, mitigation text)`,
      [JSON.stringify(riskRows), projectId, project.owner_id, firstReview, userId, now],
    );
  }

  /* Labels: the payload's names join the labels the project already has. */
  if (payload.label_names.length > 0) {
    const found = await findOrCreateLabelsByName(payload.label_names, userId, tx);
    if (found.length > 0) {
      const current = await tx.query<{ label_id: string }>("SELECT label_id FROM project_labels WHERE project_id = $1", [
        projectId,
      ]);
      const ids = Array.from(new Set([...current.map((row) => row.label_id), ...found.map((label) => label.id)]));
      await setProjectLabels(projectId, ids.slice(0, TEMPLATE_MAX_LABELS), tx);
    }
  }

  await recomputeProjectProgress(projectId, tx);
  return { milestones: milestoneRows.length, tasks: taskRows.length, metrics: metricRows.length, risks: riskRows.length };
}

/**
 * Copies engagement context from one project to another on `tx` (Convert to
 * pilot / Propose retainer): labels (added to the target's), success metrics
 * (name, unit, direction, baseline, target and notes; values and locks are
 * not copied; names already present are skipped; capped per project) and
 * members (owner excluded only when it is the target's owner).
 */
export async function cloneEngagementContext(
  tx: Queryable,
  sourceProjectId: string,
  targetProjectId: string,
  include: { labels: boolean; metrics: boolean; members: boolean },
): Promise<void> {
  const now = nowISO();
  if (include.labels) {
    await tx.execute(
      `INSERT INTO project_labels (project_id, label_id, created_at)
       SELECT $2, pl.label_id, $3 FROM project_labels pl WHERE pl.project_id = $1
       ON CONFLICT (project_id, label_id) DO NOTHING`,
      [sourceProjectId, targetProjectId, now],
    );
  }
  if (include.metrics) {
    const [source, existing] = await Promise.all([
      tx.query<{ name: string; unit: string; direction: string; baseline: number | null; target: number; notes: string }>(
        `SELECT name, unit, direction, baseline, target, notes FROM success_metrics
          WHERE project_id = $1 ORDER BY position ASC, created_at ASC`,
        [sourceProjectId],
      ),
      tx.query<{ name: string; position: number }>("SELECT name, position FROM success_metrics WHERE project_id = $1", [
        targetProjectId,
      ]),
    ]);
    const taken = new Set(existing.map((metric) => metric.name.trim().toLowerCase()));
    let position = existing.reduce((max, metric) => Math.max(max, metric.position), -1);
    const room = Math.max(0, MAX_SUCCESS_METRICS - existing.length);
    const insert: { id: string; name: string; unit: string; direction: string; baseline: number | null; target: number; notes: string; position: number }[] = [];
    for (const metric of source) {
      if (insert.length >= room) break;
      const key = metric.name.trim().toLowerCase();
      if (taken.has(key)) continue;
      taken.add(key);
      position += 1;
      insert.push({ id: newId(), ...metric, position });
    }
    if (insert.length > 0) {
      await tx.execute(
        `INSERT INTO success_metrics (id, project_id, name, unit, direction, baseline, target, position, notes, created_at, updated_at)
         SELECT r.id, $2, r.name, r.unit, r.direction, r.baseline, r.target, r.position, r.notes, $3, $3
           FROM jsonb_to_recordset($1::jsonb) AS r(id text, name text, unit text, direction text, baseline float8,
                                                   target float8, notes text, position int)
         ON CONFLICT (project_id, (lower(name))) DO NOTHING`,
        [JSON.stringify(insert), targetProjectId, now],
      );
    }
  }
  if (include.members) {
    await tx.execute(
      `INSERT INTO project_members (project_id, user_id, added_at)
       SELECT $2, pm.user_id, $3
         FROM project_members pm
         JOIN users u ON u.id = pm.user_id AND u.is_active
        WHERE pm.project_id = $1
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [sourceProjectId, targetProjectId, now],
    );
  }
}

/* ------------------------- Creation orchestrations ---------------------- */

/** What a template-based creation produced (the actions log and subscribe from it). */
export interface TemplateCreation {
  project: Project;
  template: { key: string; name: string };
  applied: ApplyTemplateResult;
  start_date: string;
  member_ids: string[];
}

/**
 * The input with the template's defaults in every field it leaves empty:
 * start date (`today` when none), due date (the schedule's `build_end_date`),
 * progress mode, engagement type, service line (the payload's, else the
 * template's first suggestion unless a parent supplies one), delivery state
 * and budget period; tuning days and the template key always come from the
 * template.
 */
export function withTemplateDefaults(
  input: CreateProjectFullInput,
  template: ResolvedTemplate,
  today: string,
): CreateProjectFullInput & { start_date: string } {
  const payload = template.payload;
  const startDate = input.start_date || today;
  const schedule = computeTemplateSchedule(payload, startDate);
  const hasPlan = payload.milestones.length > 0;
  const serviceLine =
    input.service_line ?? payload.service_line ?? (input.parent_id ? undefined : (template.service_lines[0] ?? undefined));
  const result: CreateProjectFullInput & { start_date: string } = {
    ...input,
    start_date: startDate,
    due_date: input.due_date || (hasPlan ? schedule.build_end_date : null),
    progress_mode: input.progress_mode ?? payload.progress_mode,
    engagement_type: input.engagement_type ?? payload.engagement_type,
    delivery_state: input.delivery_state ?? payload.delivery_state,
    budget_period: input.budget_period ?? payload.budget_period,
    tuning_days: payload.tuning_days,
    template_key: template.key,
  };
  if (serviceLine !== undefined) result.service_line = serviceLine;
  else delete result.service_line;
  return result;
}

/**
 * Creates a project from a template in one transaction (createProject with
 * applyTemplate in `afterInsert`). `input` should already be validated; the
 * template provenance keys in it are replaced by the template's. Throws
 * TEMPLATE_ERRORS.notFound for an unknown key.
 */
export async function createProjectFromTemplate(
  input: CreateProjectFullInput,
  templateKey: string,
  userId: string,
  today: string,
  options: ProjectQueryOptions = {},
): Promise<TemplateCreation> {
  const template = await resolveTemplate(templateKey);
  if (!template) throw new Error(TEMPLATE_ERRORS.notFound);
  const prepared = withTemplateDefaults({ ...input, source_project_id: input.source_project_id ?? null }, template, today);
  let applied: ApplyTemplateResult = { milestones: 0, tasks: 0, metrics: 0, risks: 0 };
  const project = await createProject(prepared, userId, {
    includeCommercial: options.includeCommercial,
    afterInsert: async (tx, created) => {
      applied = await applyTemplate(tx, created.id, template.payload, prepared.start_date, userId);
    },
  });
  return {
    project,
    template: { key: template.key, name: template.name },
    applied,
    start_date: prepared.start_date,
    member_ids: prepared.member_ids ?? [],
  };
}

/** Where a project stands for Convert to pilot / Propose retainer (drives the buttons). */
export interface TemplateConversionState {
  project_id: string;
  /** Consulting service line or created from the AI readiness template. */
  is_assessment: boolean;
  /** The `plan` phase exists and is done. */
  plan_done: boolean;
  can_convert_to_pilot: boolean;
  /** Why Convert to pilot is unavailable (null when available). */
  pilot_blocker: string | null;
  /** Live, has gone live or was handed over. */
  delivered: boolean;
  can_propose_retainer: boolean;
  retainer_blocker: string | null;
  /** Projects already created from this one (pilots, retainers). */
  conversions: { id: string; name: string; template_key: string | null }[];
  /** The start date Propose retainer uses when none is chosen (see `defaultRetainerStart`). */
  default_retainer_start: string;
  /** The source's monthly hours budget (the retainer's default), else null. */
  default_retainer_hours: number | null;
}

/** When the source's tuning window closes, or today when that has passed or there is no go-live. */
export function defaultRetainerStart(
  project: Pick<Project, "go_live_date" | "tuning_days" | "tuning_closed_at">,
  today: string,
): string {
  const tuningEnd = project.tuning_closed_at ? null : tuningEndDate(project.go_live_date, project.tuning_days);
  return tuningEnd && tuningEnd > today ? tuningEnd : today;
}

export async function getConversionState(projectId: string, today: string): Promise<TemplateConversionState | null> {
  const project = await db.queryOne<
    Pick<
      Project,
      | "id"
      | "service_line"
      | "template_key"
      | "engagement_type"
      | "go_live_date"
      | "delivery_state"
      | "tuning_days"
      | "tuning_closed_at"
      | "budget_hours"
      | "budget_period"
    >
  >(
    `SELECT id, service_line, template_key, engagement_type, go_live_date, delivery_state, tuning_days,
            tuning_closed_at, budget_hours, budget_period
       FROM projects WHERE id = $1`,
    [projectId],
  );
  if (!project) return null;
  const [plan, conversions] = await Promise.all([
    db.queryOne<{ total: number; done: number }>(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'done')::int AS done
         FROM milestones WHERE project_id = $1 AND kind = 'phase' AND phase_key = $2`,
      [projectId, PLAN_PHASE_KEY],
    ),
    db.query<{ id: string; name: string; template_key: string | null }>(
      "SELECT id, name, template_key FROM projects WHERE source_project_id = $1 ORDER BY created_at ASC",
      [projectId],
    ),
  ]);
  const isAssessment = project.service_line === "consulting" || project.template_key === ASSESSMENT_TEMPLATE_KEY;
  const planDone = (plan?.total ?? 0) > 0 && (plan?.done ?? 0) > 0;
  const isRetainer = project.engagement_type === "retainer" || project.template_key === RETAINER_TEMPLATE_KEY;
  return {
    project_id: project.id,
    is_assessment: isAssessment,
    plan_done: planDone,
    can_convert_to_pilot: isAssessment && planDone,
    pilot_blocker: !isAssessment ? TEMPLATE_ERRORS.notAssessment : !planDone ? TEMPLATE_ERRORS.planNotDone : null,
    delivered:
      project.go_live_date !== null || project.delivery_state === "production" || project.delivery_state === "handed_over",
    can_propose_retainer: !isRetainer,
    retainer_blocker: isRetainer ? TEMPLATE_ERRORS.alreadyRetainer : null,
    conversions,
    default_retainer_start: defaultRetainerStart(project, today),
    default_retainer_hours: project.budget_period === "monthly" ? project.budget_hours : null,
  };
}

/** Project names are at most 120 characters. */
function projectName(prefix: string, name: string): string {
  const full = `${prefix}${name}`;
  return full.length <= 120 ? full : `${full.slice(0, 119).trimEnd()}…`;
}

export interface ConversionChoices {
  name?: string;
  start_date?: string;
}

/** A conversion's result: the new project plus the source it came from. */
export interface ConversionCreation extends TemplateCreation {
  source: { id: string; name: string };
}

/**
 * Convert to pilot: a new AI delivery project for the same client (currency,
 * owner, priority and parent) with the assessment's labels, success metrics
 * and members, `source_project_id` set. Only for an assessment whose Plan
 * phase is done (user-facing Error otherwise). Starts `today` unless chosen.
 */
export async function convertToPilot(
  sourceProjectId: string,
  userId: string,
  today: string,
  choices: ConversionChoices & { service_line?: ServiceLine } = {},
  options: ProjectQueryOptions = {},
): Promise<ConversionCreation> {
  const state = await getConversionState(sourceProjectId, today);
  if (!state) throw new Error(TEMPLATE_ERRORS.projectNotFound);
  if (!state.can_convert_to_pilot) throw new Error(state.pilot_blocker ?? TEMPLATE_ERRORS.planNotDone);
  const source = await getProject(sourceProjectId);
  if (!source) throw new Error(TEMPLATE_ERRORS.projectNotFound);
  const template = await resolveTemplate(PILOT_TEMPLATE_KEY);
  if (!template) throw new Error(TEMPLATE_ERRORS.notFound);

  const input = withTemplateDefaults(
    {
      name: choices.name?.trim() || projectName("Pilot: ", source.name),
      description: `Pilot converted from the assessment "${source.name}".`,
      status: "to_start",
      priority: source.priority,
      owner_id: source.owner_id,
      parent_id: source.parent_id,
      client_id: source.client_id,
      currency: source.currency,
      service_line: choices.service_line ?? template.service_lines[0] ?? null,
      start_date: choices.start_date ?? today,
      source_project_id: source.id,
    },
    template,
    today,
  );
  let applied: ApplyTemplateResult = { milestones: 0, tasks: 0, metrics: 0, risks: 0 };
  const project = await createProject(input, userId, {
    includeCommercial: options.includeCommercial,
    afterInsert: async (tx, created) => {
      // The assessment's agreed metrics come first; the template's defaults fill the remaining room.
      await cloneEngagementContext(tx, source.id, created.id, { labels: true, metrics: true, members: true });
      applied = await applyTemplate(tx, created.id, template.payload, input.start_date, userId);
    },
  });
  return {
    project,
    template: { key: template.key, name: template.name },
    applied,
    start_date: input.start_date,
    member_ids: source.members.map((member) => member.id),
    source: { id: source.id, name: source.name },
  };
}

/**
 * Propose retainer: a new Retainer project for the same client (currency,
 * service line, owner, priority, parent), with the source's labels and
 * members, `source_project_id` set and status To start (a proposal). It
 * starts when the source's tuning window closes (today if that is past or
 * there is no go-live), unless chosen; the hours budget defaults to the
 * source's monthly budget. Refused for an engagement that is already a
 * retainer.
 */
export async function proposeRetainer(
  sourceProjectId: string,
  userId: string,
  today: string,
  choices: ConversionChoices & { budget_hours?: number | null } = {},
  options: ProjectQueryOptions = {},
): Promise<ConversionCreation> {
  const state = await getConversionState(sourceProjectId, today);
  if (!state) throw new Error(TEMPLATE_ERRORS.projectNotFound);
  if (!state.can_propose_retainer) throw new Error(state.retainer_blocker ?? TEMPLATE_ERRORS.alreadyRetainer);
  const source = await getProject(sourceProjectId);
  if (!source) throw new Error(TEMPLATE_ERRORS.projectNotFound);
  const template = await resolveTemplate(RETAINER_TEMPLATE_KEY);
  if (!template) throw new Error(TEMPLATE_ERRORS.notFound);

  const budgetHours = choices.budget_hours !== undefined ? choices.budget_hours : state.default_retainer_hours;

  const input = withTemplateDefaults(
    {
      name: choices.name?.trim() || projectName("Retainer: ", source.name),
      description: `Retainer proposed after "${source.name}".`,
      status: "to_start",
      priority: source.priority,
      owner_id: source.owner_id,
      parent_id: source.parent_id,
      client_id: source.client_id,
      currency: source.currency,
      service_line: source.service_line,
      budget_hours: budgetHours,
      start_date: choices.start_date ?? state.default_retainer_start,
      source_project_id: source.id,
    },
    template,
    today,
  );
  // The retainer continues the same line of work (never a guessed default).
  input.service_line = source.service_line;
  let applied: ApplyTemplateResult = { milestones: 0, tasks: 0, metrics: 0, risks: 0 };
  const project = await createProject(input, userId, {
    includeCommercial: options.includeCommercial,
    afterInsert: async (tx, created) => {
      await cloneEngagementContext(tx, source.id, created.id, { labels: true, metrics: false, members: true });
      applied = await applyTemplate(tx, created.id, template.payload, input.start_date, userId);
    },
  });
  return {
    project,
    template: { key: template.key, name: template.name },
    applied,
    start_date: input.start_date,
    member_ids: source.members.map((member) => member.id),
    source: { id: source.id, name: source.name },
  };
}
