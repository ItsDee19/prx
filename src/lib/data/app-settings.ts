import { db, nowISO, type Queryable, type SqlParam } from "@/lib/db";
import {
  DEFAULT_TUNING_DAYS,
  DEFAULT_UPDATE_CADENCE_DAYS,
  DEFAULT_USD_INR_RATE,
  DEFAULT_WORKSPACE_TIMEZONE,
  MAX_TUNING_DAYS,
  MAX_UPDATE_CADENCE_DAYS,
  MIN_UPDATE_CADENCE_DAYS,
} from "@/lib/constants";
import type { AppSettings, ProjectQueryOptions, UpdateAppSettingsInput } from "@/lib/types";
import { isValidTimeZone, safeTimeZone, workspaceToday } from "@/lib/workspace-time";

/**
 * Workspace settings: one row (`app_settings.id = 1`). The bootstrap inserts
 * it; every read re-inserts the default row when it is missing so a database
 * that lost it (manual cleanup) keeps working.
 *
 * `usd_inr_rate` is ADMIN-ONLY: it is null unless the caller passes
 * `includeCommercial: true` (which must be `user.role === "admin"`).
 */

interface AppSettingsRow {
  workspace_timezone: string;
  /** DOUBLE PRECISION: node-postgres returns a JS number. */
  usd_inr_rate: number;
  default_tuning_days: number;
  update_cadence_days: number;
  labels_seeded_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

const SETTINGS_COLUMNS = `workspace_timezone, usd_inr_rate, default_tuning_days, update_cadence_days,
  labels_seeded_at, updated_by, updated_at`;

function toAppSettings(row: AppSettingsRow, includeCommercial: boolean): AppSettings {
  return {
    workspace_timezone: row.workspace_timezone,
    usd_inr_rate: includeCommercial ? Number(row.usd_inr_rate) : null,
    default_tuning_days: row.default_tuning_days,
    update_cadence_days: row.update_cadence_days,
    labels_seeded_at: row.labels_seeded_at,
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  };
}

/** Defaults used only if the row cannot be read back right after re-inserting it. */
function defaultRow(): AppSettingsRow {
  return {
    workspace_timezone: DEFAULT_WORKSPACE_TIMEZONE,
    usd_inr_rate: DEFAULT_USD_INR_RATE,
    default_tuning_days: DEFAULT_TUNING_DAYS,
    update_cadence_days: DEFAULT_UPDATE_CADENCE_DAYS,
    labels_seeded_at: null,
    updated_by: null,
    updated_at: null,
  };
}

async function readRow(q: Queryable): Promise<AppSettingsRow> {
  const row = await q.queryOne<AppSettingsRow>(`SELECT ${SETTINGS_COLUMNS} FROM app_settings WHERE id = 1`);
  if (row) return row;
  await q.execute("INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
  return (await q.queryOne<AppSettingsRow>(`SELECT ${SETTINGS_COLUMNS} FROM app_settings WHERE id = 1`)) ?? defaultRow();
}

/** The workspace settings; `usd_inr_rate` is null unless `includeCommercial`. */
export async function getAppSettings(options: ProjectQueryOptions = {}, q: Queryable = db): Promise<AppSettings> {
  return toAppSettings(await readRow(q), options.includeCommercial === true);
}

/** IANA zone used for every "today" (validated; falls back to Asia/Kolkata). */
export async function getWorkspaceTimezone(): Promise<string> {
  const row = await readRow(db);
  return safeTimeZone(row.workspace_timezone);
}

/** "YYYY-MM-DD" in the workspace timezone. */
export async function getWorkspaceToday(now?: Date): Promise<string> {
  return workspaceToday(await getWorkspaceTimezone(), now);
}

/**
 * Updates the provided keys. ADMIN-ONLY (the action requires an admin).
 * Throws a user-facing Error for an unknown timezone or out-of-range values.
 */
export async function updateAppSettings(
  patch: UpdateAppSettingsInput,
  userId: string,
  options: ProjectQueryOptions = {},
): Promise<AppSettings> {
  const sets: string[] = [];
  const values: SqlParam[] = [];
  const add = (column: string, value: SqlParam) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (patch.workspace_timezone !== undefined) {
    const zone = patch.workspace_timezone.trim();
    if (!isValidTimeZone(zone)) throw new Error("Choose a valid time zone.");
    add("workspace_timezone", zone);
  }
  if (patch.usd_inr_rate !== undefined) {
    if (!Number.isFinite(patch.usd_inr_rate) || patch.usd_inr_rate <= 0) {
      throw new Error("The USD to INR rate must be greater than zero.");
    }
    add("usd_inr_rate", patch.usd_inr_rate);
  }
  if (patch.default_tuning_days !== undefined) {
    const days = patch.default_tuning_days;
    if (!Number.isInteger(days) || days < 0 || days > MAX_TUNING_DAYS) {
      throw new Error(`Default tuning days must be a whole number from 0 to ${MAX_TUNING_DAYS}.`);
    }
    add("default_tuning_days", days);
  }
  if (patch.update_cadence_days !== undefined) {
    const days = patch.update_cadence_days;
    if (!Number.isInteger(days) || days < MIN_UPDATE_CADENCE_DAYS || days > MAX_UPDATE_CADENCE_DAYS) {
      throw new Error(
        `The update cadence must be a whole number of days from ${MIN_UPDATE_CADENCE_DAYS} to ${MAX_UPDATE_CADENCE_DAYS}.`,
      );
    }
    add("update_cadence_days", days);
  }

  await db.execute("INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
  if (sets.length > 0) {
    add("updated_by", userId);
    add("updated_at", nowISO());
    await db.execute(`UPDATE app_settings SET ${sets.join(", ")} WHERE id = 1`, values);
  }
  return getAppSettings(options);
}

/** Records that DEFAULT_LABELS were inserted (see ensureDefaultLabels in labels.ts). */
export async function markLabelsSeeded(q: Queryable = db): Promise<void> {
  await q.execute(
    `INSERT INTO app_settings (id, labels_seeded_at) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET labels_seeded_at = EXCLUDED.labels_seeded_at`,
    [nowISO()],
  );
}
