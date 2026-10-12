import { db, newId, nowISO, type SqlParam } from "@/lib/db";
import { CLIENT_CODE_PATTERN, CLIENT_COLORS, CLIENT_REGION_CONFIG, OPEN_STATUSES } from "@/lib/constants";
import {
  CLIENT_REGIONS,
  CURRENCIES,
  type Activity,
  type ActivityType,
  type Client,
  type ClientCommercialSummary,
  type ClientFilters,
  type ClientRegion,
  type ClientSummary,
  type ClientWithMeta,
  type CreateClientInput,
  type Currency,
  type CurrencyTotals,
  type ProjectQueryOptions,
  type RagHealth,
  type UpdateClientInput,
} from "@/lib/types";
import { colorFromString, likeContains, taskKey } from "@/lib/utils";

/**
 * Clients (the companies AvlysAI delivers for). Every engagement (top-level
 * project) may belong to one; sub-projects inherit the client.
 *
 * ClientWithMeta.commercial (contract values and invoiced/paid phase prices,
 * per currency) is ADMIN-ONLY: null unless `includeCommercial: true`.
 */

const CLIENT_COLUMNS = `c.id, c.name, c.code, c.industry, c.region, c.currency, c.website, c.contact_name,
  c.contact_email, c.contact_role, c.systems, c.nda_signed, c.dpa_signed, c.confidential, c.color,
  c.notes, c.archived_at, c.created_by, c.created_at, c.updated_at`;

const RETURNING_COLUMNS = `id, name, code, industry, region, currency, website, contact_name, contact_email,
  contact_role, systems, nda_signed, dpa_signed, confidential, color, notes, archived_at, created_by,
  created_at, updated_at`;

interface ClientRow extends Omit<Client, "systems"> {
  /** JSONB: parsed by node-postgres. */
  systems: unknown;
}

interface ClientMetaRow extends ClientRow {
  project_count: number;
  active_project_count: number;
  health_green: number;
  health_amber: number;
  health_red: number;
  logged_minutes: number;
}

interface MoneyRow {
  client_id: string;
  currency: Currency;
  a: number;
  b: number;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const MAX_CLIENT_SYSTEMS = 30;

function parseSystems(raw: unknown): string[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    industry: row.industry,
    region: row.region,
    currency: row.currency,
    website: row.website,
    contact_name: row.contact_name,
    contact_email: row.contact_email,
    contact_role: row.contact_role,
    systems: parseSystems(row.systems),
    nda_signed: row.nda_signed,
    dpa_signed: row.dpa_signed,
    confidential: row.confidential,
    color: row.color,
    notes: row.notes,
    archived_at: row.archived_at,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function emptyTotals(): CurrencyTotals {
  return { INR: 0, USD: 0 };
}

function emptyCommercial(): ClientCommercialSummary {
  return { contracted: emptyTotals(), active_contracted: emptyTotals(), invoiced: emptyTotals(), paid: emptyTotals() };
}

function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

function isRegion(value: unknown): value is ClientRegion {
  return typeof value === "string" && (CLIENT_REGIONS as readonly string[]).includes(value);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

function cleanText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Trimmed, de-duplicated (case-insensitive) list of system names. */
function cleanSystems(systems: string[] | undefined): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of systems ?? []) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= MAX_CLIENT_SYSTEMS) break;
  }
  return result;
}

function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

function assertCode(code: string): void {
  if (!CLIENT_CODE_PATTERN.test(code)) {
    throw new Error("Client codes are 2-6 characters: a letter, then letters or digits (e.g. HOSP).");
  }
}

/** The plain Client fields of a ClientWithMeta (drops counts and the admin-only commercial roll-up). */
export function clientRecord(client: ClientWithMeta): Client {
  return {
    id: client.id,
    name: client.name,
    code: client.code,
    industry: client.industry,
    region: client.region,
    currency: client.currency,
    website: client.website,
    contact_name: client.contact_name,
    contact_email: client.contact_email,
    contact_role: client.contact_role,
    systems: client.systems,
    nda_signed: client.nda_signed,
    dpa_signed: client.dpa_signed,
    confidential: client.confidential,
    color: client.color,
    notes: client.notes,
    archived_at: client.archived_at,
    created_by: client.created_by,
    created_at: client.created_at,
    updated_at: client.updated_at,
  };
}

/* ------------------------------- Reads ------------------------------- */

const META_SELECT = `
  SELECT ${CLIENT_COLUMNS},
         COALESCE(pc.project_count, 0)::int AS project_count,
         COALESCE(pc.active_project_count, 0)::int AS active_project_count,
         COALESCE(pc.health_green, 0)::int AS health_green,
         COALESCE(pc.health_amber, 0)::int AS health_amber,
         COALESCE(pc.health_red, 0)::int AS health_red,
         COALESCE(tm.logged_minutes, 0)::int AS logged_minutes
    FROM clients c
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS project_count,
             COUNT(*) FILTER (WHERE p.status = ANY($1::text[]))::int AS active_project_count,
             COUNT(*) FILTER (WHERE p.status = ANY($1::text[]) AND p.health = 'green')::int AS health_green,
             COUNT(*) FILTER (WHERE p.status = ANY($1::text[]) AND p.health = 'amber')::int AS health_amber,
             COUNT(*) FILTER (WHERE p.status = ANY($1::text[]) AND p.health = 'red')::int AS health_red
        FROM projects p
       WHERE p.client_id = c.id AND p.parent_id IS NULL
    ) pc ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(te.minutes), 0)::int AS logged_minutes
        FROM time_entries te
        JOIN projects p ON p.id = te.project_id
       WHERE p.client_id = c.id
    ) tm ON TRUE`;

/** ADMIN-ONLY money roll-up for the given clients (top-level engagements, per currency). */
async function loadCommercial(clientIds: string[]): Promise<Map<string, ClientCommercialSummary>> {
  const result = new Map<string, ClientCommercialSummary>();
  if (clientIds.length === 0) return result;
  const [contracts, invoices] = await Promise.all([
    db.query<MoneyRow>(
      `SELECT p.client_id, p.currency,
              COALESCE(SUM(p.contract_value), 0)::float8 AS a,
              COALESCE(SUM(p.contract_value) FILTER (WHERE p.status = ANY($2::text[])), 0)::float8 AS b
         FROM projects p
        WHERE p.client_id = ANY($1::text[]) AND p.parent_id IS NULL
          AND p.currency IS NOT NULL AND p.contract_value IS NOT NULL
        GROUP BY p.client_id, p.currency`,
      [clientIds, OPEN_STATUSES],
    ),
    db.query<MoneyRow>(
      `SELECT p.client_id, p.currency,
              COALESCE(SUM(m.price) FILTER (WHERE m.invoice_status IN ('invoiced', 'paid')), 0)::float8 AS a,
              COALESCE(SUM(m.price) FILTER (WHERE m.invoice_status = 'paid'), 0)::float8 AS b
         FROM milestones m
         JOIN projects p ON p.id = m.project_id
        WHERE p.client_id = ANY($1::text[]) AND p.parent_id IS NULL
          AND p.currency IS NOT NULL AND m.price IS NOT NULL
        GROUP BY p.client_id, p.currency`,
      [clientIds],
    ),
  ]);
  const summaryFor = (clientId: string) => {
    const existing = result.get(clientId);
    if (existing) return existing;
    const created = emptyCommercial();
    result.set(clientId, created);
    return created;
  };
  for (const row of contracts) {
    if (!isCurrency(row.currency)) continue;
    const summary = summaryFor(row.client_id);
    summary.contracted[row.currency] += Number(row.a);
    summary.active_contracted[row.currency] += Number(row.b);
  }
  for (const row of invoices) {
    if (!isCurrency(row.currency)) continue;
    const summary = summaryFor(row.client_id);
    summary.invoiced[row.currency] += Number(row.a);
    summary.paid[row.currency] += Number(row.b);
  }
  return result;
}

async function hydrate(rows: ClientMetaRow[], includeCommercial: boolean): Promise<ClientWithMeta[]> {
  const commercial = includeCommercial ? await loadCommercial(rows.map((row) => row.id)) : null;
  return rows.map((row) => {
    const health: Record<RagHealth, number> = {
      green: row.health_green,
      amber: row.health_amber,
      red: row.health_red,
    };
    return {
      ...toClient(row),
      project_count: row.project_count,
      active_project_count: row.active_project_count,
      health_counts: health,
      logged_minutes: row.logged_minutes,
      commercial: commercial ? (commercial.get(row.id) ?? emptyCommercial()) : null,
    };
  });
}

/** Clients by name; archived ones only with `includeArchived`. `commercial` is null unless includeCommercial. */
export async function listClients(
  filters: ClientFilters = {},
  options: ProjectQueryOptions = {},
): Promise<ClientWithMeta[]> {
  const params: SqlParam[] = [OPEN_STATUSES];
  const where: string[] = [];
  const add = (value: SqlParam) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (!filters.includeArchived) where.push("c.archived_at IS NULL");
  const search = filters.search?.trim();
  if (search) {
    const pattern = add(likeContains(search));
    where.push(
      `(c.name ILIKE ${pattern} ESCAPE '\\' OR c.code ILIKE ${pattern} ESCAPE '\\' OR c.industry ILIKE ${pattern} ESCAPE '\\')`,
    );
  }
  const industry = filters.industry?.trim();
  if (industry) where.push(`lower(c.industry) = lower(${add(industry)})`);
  if (filters.region && isRegion(filters.region)) where.push(`c.region = ${add(filters.region)}`);

  const rows = await db.query<ClientMetaRow>(
    `${META_SELECT} ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY lower(c.name) ASC, c.code ASC`,
    params,
  );
  return hydrate(rows, options.includeCommercial === true);
}

/** Non-archived clients by name (pickers). */
export async function listClientSummaries(): Promise<ClientSummary[]> {
  return db.query<ClientSummary>(
    `SELECT c.id, c.name, c.code, c.color, c.currency, c.confidential
       FROM clients c
      WHERE c.archived_at IS NULL
      ORDER BY lower(c.name) ASC, c.code ASC`,
  );
}

/** Distinct non-empty industries (the /clients industry filter). */
export async function listClientIndustries(): Promise<string[]> {
  const rows = await db.query<{ industry: string }>(
    `SELECT MIN(c.industry) AS industry
       FROM clients c
      WHERE btrim(c.industry) <> ''
      GROUP BY lower(btrim(c.industry))
      ORDER BY lower(btrim(c.industry)) ASC`,
  );
  return rows.map((row) => row.industry.trim());
}

/** One client with meta (archived included); `commercial` is null unless includeCommercial. */
export async function getClient(id: string, options: ProjectQueryOptions = {}): Promise<ClientWithMeta | null> {
  const rows = await db.query<ClientMetaRow>(`${META_SELECT} WHERE c.id = $2`, [OPEN_STATUSES, id]);
  const [client] = await hydrate(rows, options.includeCommercial === true);
  return client ?? null;
}

export async function getClientByCode(code: string): Promise<Client | null> {
  const row = await db.queryOne<ClientRow>(`SELECT ${CLIENT_COLUMNS} FROM clients c WHERE c.code = $1`, [
    normaliseCode(code),
  ]);
  return row ? toClient(row) : null;
}

async function getClientRow(id: string): Promise<Client | null> {
  const row = await db.queryOne<ClientRow>(`SELECT ${CLIENT_COLUMNS} FROM clients c WHERE c.id = $1`, [id]);
  return row ? toClient(row) : null;
}

interface ClientActivityRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  actor_id: string | null;
  type: ActivityType;
  message: string;
  meta: unknown;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_color: string | null;
  actor_job_title: string | null;
  project_name: string | null;
  task_number: number | null;
  task_title: string | null;
}

function parseMeta(raw: unknown): Record<string, unknown> {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Activity for the client page, newest first: entries on any of the client's
 * projects plus the client's own create/update entries (`meta.client_id`).
 */
export async function listClientActivity(clientId: string, limit = 20): Promise<Activity[]> {
  const rows = await db.query<ClientActivityRow>(
    `SELECT a.id, a.project_id, a.task_id, a.actor_id, a.type, a.message, a.meta, a.created_at,
            u.name AS actor_name, u.email AS actor_email, u.color AS actor_color, u.job_title AS actor_job_title,
            p.name AS project_name, t.number AS task_number, t.title AS task_title
       FROM activity a
       LEFT JOIN users u ON u.id = a.actor_id
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN tasks t ON t.id = a.task_id
      WHERE a.project_id IN (SELECT id FROM projects WHERE client_id = $1)
         OR (a.project_id IS NULL AND a.meta->>'client_id' = $1)
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $2`,
    [clientId, Math.max(1, Math.min(100, Math.floor(limit)))],
  );
  return rows.map((row) => ({
    id: row.id,
    project_id: row.project_id,
    actor_id: row.actor_id,
    type: row.type,
    message: row.message,
    meta: parseMeta(row.meta),
    created_at: row.created_at,
    actor:
      row.actor_id && row.actor_name !== null
        ? {
            id: row.actor_id,
            name: row.actor_name,
            email: row.actor_email ?? "",
            color: row.actor_color ?? "#64748b",
            job_title: row.actor_job_title,
          }
        : null,
    project_name: row.project_name,
    task_id: row.task_id,
    task_key: row.task_number === null ? null : taskKey(row.task_number),
    task_title: row.task_title,
  }));
}

/* ------------------------------- Writes ------------------------------ */

async function codeOwner(code: string, exceptId?: string): Promise<{ id: string; name: string } | null> {
  return db.queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM clients WHERE code = $1 ${exceptId ? "AND id <> $2" : ""}`,
    exceptId ? [code, exceptId] : [code],
  );
}

function duplicateCodeError(code: string, name: string): Error {
  return new Error(`The code ${code} is already used by ${name}.`);
}

/** Creates a client. Code is upper-cased; a duplicate code throws a user-facing Error. */
export async function createClient(input: CreateClientInput, createdBy: string): Promise<Client> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the client a name.");
  const code = normaliseCode(input.code);
  assertCode(code);
  const clash = await codeOwner(code);
  if (clash) throw duplicateCodeError(code, clash.name);

  const region: ClientRegion = isRegion(input.region) ? input.region : "india";
  const currency: Currency = isCurrency(input.currency) ? input.currency : CLIENT_REGION_CONFIG[region].defaultCurrency;
  const color = input.color && HEX_COLOR.test(input.color) ? input.color.toLowerCase() : colorFromString(name, CLIENT_COLORS);
  const now = nowISO();

  try {
    const row = await db.queryOne<ClientRow>(
      `INSERT INTO clients (id, name, code, industry, region, currency, website, contact_name, contact_email,
         contact_role, systems, nda_signed, dpa_signed, confidential, color, notes, archived_at, created_by,
         created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, NULL, $17, $18, $18)
       RETURNING ${RETURNING_COLUMNS}`,
      [
        newId(),
        name,
        code,
        (input.industry ?? "").trim(),
        region,
        currency,
        cleanText(input.website),
        cleanText(input.contact_name),
        cleanText(input.contact_email)?.toLowerCase() ?? null,
        cleanText(input.contact_role),
        JSON.stringify(cleanSystems(input.systems)),
        input.nda_signed === true,
        input.dpa_signed === true,
        input.confidential === true,
        color,
        (input.notes ?? "").trim(),
        createdBy,
        now,
      ],
    );
    if (!row) throw new Error("Could not create the client.");
    return toClient(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      const owner = await codeOwner(code);
      throw duplicateCodeError(code, owner?.name ?? "another client");
    }
    throw error;
  }
}

/** Updates the provided keys; `archived` sets or clears `archived_at`. */
export async function updateClient(id: string, patch: UpdateClientInput): Promise<Client> {
  const existing = await getClientRow(id);
  if (!existing) throw new Error("This client no longer exists.");

  const sets: string[] = [];
  const values: SqlParam[] = [];
  const add = (column: string, value: SqlParam, cast = "") => {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  };
  // Only columns whose normalised value differs are written, so saving an unchanged form is a no-op
  // (no UPDATE, updated_at untouched, and the action logs no activity).
  const addIfChanged = <T extends SqlParam>(column: string, next: T, current: T) => {
    if (next !== current) add(column, next);
  };

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Give the client a name.");
    addIfChanged("name", name, existing.name);
  }
  let code: string | null = null;
  if (patch.code !== undefined) {
    code = normaliseCode(patch.code);
    assertCode(code);
    if (code !== existing.code) {
      const clash = await codeOwner(code, id);
      if (clash) throw duplicateCodeError(code, clash.name);
      add("code", code);
    }
  }
  if (patch.industry !== undefined) addIfChanged("industry", patch.industry.trim(), existing.industry);
  if (patch.region !== undefined) {
    if (!isRegion(patch.region)) throw new Error("Choose a valid region.");
    addIfChanged<string>("region", patch.region, existing.region);
  }
  if (patch.currency !== undefined) {
    if (!isCurrency(patch.currency)) throw new Error("Choose a valid currency.");
    addIfChanged<string>("currency", patch.currency, existing.currency);
  }
  if (patch.website !== undefined) addIfChanged("website", cleanText(patch.website), existing.website);
  if (patch.contact_name !== undefined) addIfChanged("contact_name", cleanText(patch.contact_name), existing.contact_name);
  if (patch.contact_email !== undefined) {
    addIfChanged("contact_email", cleanText(patch.contact_email)?.toLowerCase() ?? null, existing.contact_email);
  }
  if (patch.contact_role !== undefined) addIfChanged("contact_role", cleanText(patch.contact_role), existing.contact_role);
  if (patch.systems !== undefined) {
    const systems = JSON.stringify(cleanSystems(patch.systems));
    if (systems !== JSON.stringify(existing.systems)) add("systems", systems, "::jsonb");
  }
  if (patch.nda_signed !== undefined) addIfChanged("nda_signed", patch.nda_signed, existing.nda_signed);
  if (patch.dpa_signed !== undefined) addIfChanged("dpa_signed", patch.dpa_signed, existing.dpa_signed);
  if (patch.confidential !== undefined) addIfChanged("confidential", patch.confidential, existing.confidential);
  if (patch.color !== undefined) {
    if (!HEX_COLOR.test(patch.color)) throw new Error("Choose a valid colour.");
    addIfChanged("color", patch.color.toLowerCase(), existing.color.toLowerCase());
  }
  if (patch.notes !== undefined) addIfChanged("notes", patch.notes.trim(), existing.notes);

  const now = nowISO();
  if (patch.archived !== undefined) {
    if (patch.archived && !existing.archived_at) add("archived_at", now);
    else if (!patch.archived && existing.archived_at) sets.push("archived_at = NULL");
  }
  if (sets.length === 0) return existing;
  add("updated_at", now);
  values.push(id);

  try {
    const row = await db.queryOne<ClientRow>(
      `UPDATE clients SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${RETURNING_COLUMNS}`,
      values,
    );
    if (!row) throw new Error("This client no longer exists.");
    return toClient(row);
  } catch (error) {
    if (isUniqueViolation(error) && code) {
      const owner = await codeOwner(code, id);
      throw duplicateCodeError(code, owner?.name ?? "another client");
    }
    throw error;
  }
}

/** Deletes the client; its projects keep existing with `client_id` NULL (ON DELETE SET NULL). */
export async function deleteClient(id: string): Promise<void> {
  await db.execute("DELETE FROM clients WHERE id = $1", [id]);
}

/* ---------------------------- Code suggestion ------------------------- */

/** Legal-form and filler words skipped when deriving a code from a company name. */
const SKIP_WORDS = new Set([
  "THE",
  "AND",
  "OF",
  "PVT",
  "PRIVATE",
  "LTD",
  "LIMITED",
  "LLP",
  "LLC",
  "INC",
  "CORP",
  "CORPORATION",
  "CO",
  "COMPANY",
  "GMBH",
  "PLC",
]);

/** A 2-6 character base code (letter first) for a company name; not checked for uniqueness. */
export function baseClientCode(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const meaningful = words.filter((word) => !SKIP_WORDS.has(word));
  const source = meaningful.length > 0 ? meaningful : words;

  let base: string;
  if (source.length >= 2) {
    base = source
      .map((word) => word[0])
      .join("")
      .slice(0, 4);
    // Two-word names: initials alone are short; borrow letters from the first word.
    if (base.length < 3) base = (source[0].slice(0, 3) + source[1][0]).slice(0, 4);
  } else {
    base = (source[0] ?? "").slice(0, 4);
  }
  base = base.replace(/^[0-9]+/, "");
  if (base.length === 0) base = "CL";
  if (base.length < 2) base = `${base}X`;
  return base.slice(0, 6);
}

/** A unique code derived from the name (see baseClientCode); a taken code gets a numeric suffix ("ABCD" -> "ABCD2"). */
export async function suggestClientCode(name: string): Promise<string> {
  const base = baseClientCode(name);
  const rows = await db.query<{ code: string }>("SELECT code FROM clients WHERE code LIKE $1", [
    `${base.slice(0, 4)}%`,
  ]);
  const taken = new Set(rows.map((row) => row.code));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    const suffix = String(n);
    const candidate = `${base.slice(0, 6 - suffix.length)}${suffix}`;
    if (!taken.has(candidate) && !(await codeOwner(candidate))) return candidate;
  }
  return base;
}
