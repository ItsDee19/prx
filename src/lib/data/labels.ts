import { db, newId, nowISO, transaction, type Queryable } from "@/lib/db";
import { DEFAULT_LABELS, LABEL_COLORS, LABEL_GROUP_ORDER } from "@/lib/constants";
import { LABEL_GROUPS, type CreateLabelInput, type Label, type LabelGroup, type LabelSummary, type LabelWithUsage, type UpdateLabelInput } from "@/lib/types";
import { colorFromString } from "@/lib/utils";
import { markLabelsSeeded } from "./app-settings";

/**
 * Label catalogue (tech stack, domain and general tags) and the project label
 * join. Names are unique case-insensitively (`uq_labels_name_lower`).
 *
 * DEFAULT_LABELS are inserted by ensureDefaultLabels(), never by the schema
 * bootstrap, so a label an admin deletes stays deleted; only an empty
 * catalogue (or one never seeded) is re-seeded.
 */

const LABEL_COLUMNS = "l.id, l.name, l.color, l.label_group, l.created_by, l.created_at, l.updated_at";

/** Tech, then domain, then general (LABEL_GROUP_ORDER; constants, not user input). */
export const LABEL_GROUP_RANK_SQL = `CASE l.label_group ${LABEL_GROUP_ORDER.map(
  (group, index) => `WHEN '${group}' THEN ${index}`,
).join(" ")} ELSE ${LABEL_GROUP_ORDER.length} END`;

/** ORDER BY for labels aliased `l`: group order, then name. */
export const LABEL_ORDER_SQL = `${LABEL_GROUP_RANK_SQL} ASC, lower(l.name) ASC`;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const LABEL_NAME_MAX = 40;

function isLabelGroup(value: unknown): value is LabelGroup {
  return typeof value === "string" && (LABEL_GROUPS as readonly string[]).includes(value);
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

function toSummary(label: Pick<Label, "id" | "name" | "color" | "label_group">): LabelSummary {
  return { id: label.id, name: label.name, color: label.color, label_group: label.label_group };
}

/* ------------------------------ Seeding ------------------------------ */

/**
 * Inserts DEFAULT_LABELS when the catalogue was never seeded or is empty, and
 * sets `app_settings.labels_seeded_at`, in one transaction. Opens its own
 * connection: never call it while holding a transaction.
 */
export async function ensureDefaultLabels(): Promise<void> {
  const state = await db.queryOne<{ seeded: boolean }>(
    `SELECT (EXISTS (SELECT 1 FROM app_settings WHERE id = 1 AND labels_seeded_at IS NOT NULL)
             AND EXISTS (SELECT 1 FROM labels)) AS seeded`,
  );
  if (state?.seeded) return;

  const now = nowISO();
  await transaction(async (tx) => {
    await tx.execute(
      `INSERT INTO labels (id, name, color, label_group, created_by, created_at, updated_at)
       SELECT d.id, d.name, d.color, d.label_group, NULL, $5, $5
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS d(id, name, color, label_group)
       ON CONFLICT ((lower(name))) DO NOTHING`,
      [
        DEFAULT_LABELS.map(() => newId()),
        DEFAULT_LABELS.map((label) => label.name),
        DEFAULT_LABELS.map((label) => label.color),
        DEFAULT_LABELS.map((label) => label.label_group),
        now,
      ],
    );
    await markLabelsSeeded(tx);
  });
}

/* ------------------------------- Reads ------------------------------- */

/** Every label (seeding the defaults first when needed), tech then domain then general, by name. */
export async function listLabels(): Promise<Label[]> {
  await ensureDefaultLabels();
  return db.query<Label>(`SELECT ${LABEL_COLUMNS} FROM labels l ORDER BY ${LABEL_ORDER_SQL}`);
}

/** listLabels plus how many projects and tasks carry each label (Settings > Labels). */
export async function listLabelsWithUsage(): Promise<LabelWithUsage[]> {
  await ensureDefaultLabels();
  return db.query<LabelWithUsage>(
    `SELECT ${LABEL_COLUMNS},
            (SELECT COUNT(*)::int FROM project_labels pl WHERE pl.label_id = l.id) AS project_count,
            (SELECT COUNT(*)::int FROM task_labels tl WHERE tl.label_id = l.id) AS task_count
       FROM labels l
      ORDER BY ${LABEL_ORDER_SQL}`,
  );
}

export async function getLabel(id: string, q: Queryable = db): Promise<Label | null> {
  return q.queryOne<Label>(`SELECT ${LABEL_COLUMNS} FROM labels l WHERE l.id = $1`, [id]);
}

async function getLabelByName(name: string, q: Queryable = db): Promise<Label | null> {
  return q.queryOne<Label>(`SELECT ${LABEL_COLUMNS} FROM labels l WHERE lower(l.name) = lower($1)`, [name]);
}

/* ------------------------------ Catalogue ---------------------------- */

/**
 * Creates a label, or returns the existing one when the name is already used
 * (case-insensitive). Colour defaults from the name; group defaults to general.
 */
export async function createLabel(input: CreateLabelInput, createdBy: string): Promise<Label> {
  const name = cleanName(input.name);
  if (!name) throw new Error("Give the label a name.");
  if (name.length > LABEL_NAME_MAX) throw new Error(`Label names must be ${LABEL_NAME_MAX} characters or fewer.`);
  const existing = await getLabelByName(name);
  if (existing) return existing;

  const color = input.color && HEX_COLOR.test(input.color) ? input.color.toLowerCase() : colorFromString(name, LABEL_COLORS);
  const group: LabelGroup = isLabelGroup(input.label_group) ? input.label_group : "general";
  const now = nowISO();
  try {
    const created = await db.queryOne<Label>(
      `INSERT INTO labels (id, name, color, label_group, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id, name, color, label_group, created_by, created_at, updated_at`,
      [newId(), name, color, group, createdBy, now],
    );
    if (!created) throw new Error("Could not create the label.");
    return created;
  } catch (error) {
    // Someone created the same name a moment ago.
    if (isUniqueViolation(error)) {
      const raced = await getLabelByName(name);
      if (raced) return raced;
    }
    throw error;
  }
}

/** Renames, recolours or regroups a label. Duplicate names throw a user-facing Error. */
export async function updateLabel(id: string, patch: UpdateLabelInput): Promise<Label> {
  const existing = await getLabel(id);
  if (!existing) throw new Error("This label no longer exists.");

  const sets: string[] = [];
  const values: (string | null)[] = [];
  const add = (column: string, value: string) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) throw new Error("Give the label a name.");
    if (name.length > LABEL_NAME_MAX) throw new Error(`Label names must be ${LABEL_NAME_MAX} characters or fewer.`);
    if (name !== existing.name) {
      const clash = await getLabelByName(name);
      if (clash && clash.id !== id) throw new Error(`A label named "${clash.name}" already exists.`);
      add("name", name);
    }
  }
  if (patch.color !== undefined) {
    if (!HEX_COLOR.test(patch.color)) throw new Error("Choose a valid colour.");
    add("color", patch.color.toLowerCase());
  }
  if (patch.label_group !== undefined) {
    if (!isLabelGroup(patch.label_group)) throw new Error("Choose a valid label group.");
    add("label_group", patch.label_group);
  }
  if (sets.length === 0) return existing;

  add("updated_at", nowISO());
  values.push(id);
  try {
    const updated = await db.queryOne<Label>(
      `UPDATE labels SET ${sets.join(", ")} WHERE id = $${values.length}
       RETURNING id, name, color, label_group, created_by, created_at, updated_at`,
      values,
    );
    if (!updated) throw new Error("This label no longer exists.");
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("A label with this name already exists.");
    throw error;
  }
}

/** Removes the label from the catalogue and from every project and task (ON DELETE CASCADE). */
export async function deleteLabel(id: string): Promise<void> {
  await db.execute("DELETE FROM labels WHERE id = $1", [id]);
}

/* ---------------------------- Assignments ---------------------------- */

async function selectProjectLabels(projectId: string, q: Queryable): Promise<LabelSummary[]> {
  return q.query<LabelSummary>(
    `SELECT l.id, l.name, l.color, l.label_group
       FROM project_labels pl
       JOIN labels l ON l.id = pl.label_id
      WHERE pl.project_id = $1
      ORDER BY ${LABEL_ORDER_SQL}`,
    [projectId],
  );
}

async function replaceProjectLabels(projectId: string, labelIds: string[], q: Queryable): Promise<LabelSummary[]> {
  const wanted = Array.from(new Set(labelIds.filter((id) => id.trim() !== "")));
  await q.execute("DELETE FROM project_labels WHERE project_id = $1 AND NOT (label_id = ANY($2::text[]))", [
    projectId,
    wanted,
  ]);
  if (wanted.length > 0) {
    // Unknown ids are ignored (only labels that exist are attached).
    await q.execute(
      `INSERT INTO project_labels (project_id, label_id, created_at)
       SELECT $1, l.id, $3 FROM labels l WHERE l.id = ANY($2::text[])
       ON CONFLICT (project_id, label_id) DO NOTHING`,
      [projectId, wanted, nowISO()],
    );
  }
  return selectProjectLabels(projectId, q);
}

/**
 * Replaces the project's label set and returns it (group order, then name).
 * Runs on `q` when given (inside the caller's transaction), otherwise in its own.
 */
export async function setProjectLabels(projectId: string, labelIds: string[], q?: Queryable): Promise<LabelSummary[]> {
  if (q) return replaceProjectLabels(projectId, labelIds, q);
  return transaction((tx) => replaceProjectLabels(projectId, labelIds, tx));
}

/**
 * Templates: the labels with these names (case-insensitive), creating missing
 * ones in the "general" group. Returned in the order of `names` (duplicates
 * collapse). Safe inside a transaction when `q` is passed (never seeds defaults).
 */
export async function findOrCreateLabelsByName(
  names: string[],
  createdBy: string,
  q: Queryable = db,
): Promise<LabelSummary[]> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = cleanName(raw).slice(0, LABEL_NAME_MAX);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  if (unique.length === 0) return [];

  const now = nowISO();
  await q.execute(
    `INSERT INTO labels (id, name, color, label_group, created_by, created_at, updated_at)
     SELECT n.id, n.name, n.color, 'general', $4, $5, $5
       FROM unnest($1::text[], $2::text[], $3::text[]) AS n(id, name, color)
     ON CONFLICT ((lower(name))) DO NOTHING`,
    [unique.map(() => newId()), unique, unique.map((name) => colorFromString(name, LABEL_COLORS)), createdBy, now],
  );
  const rows = await q.query<LabelSummary>(
    `SELECT l.id, l.name, l.color, l.label_group FROM labels l WHERE lower(l.name) = ANY($1::text[])`,
    [unique.map((name) => name.toLowerCase())],
  );
  const byName = new Map(rows.map((row) => [row.name.toLowerCase(), toSummary(row)]));
  return unique.map((name) => byName.get(name.toLowerCase())).filter((label): label is LabelSummary => Boolean(label));
}
