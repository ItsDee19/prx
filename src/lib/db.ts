import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { randomUUID } from "node:crypto";

/**
 * Postgres access for PRX.
 *
 * - Production (Vercel): connect a Neon Postgres database from the Vercel
 *   dashboard (Storage → Create Database → Neon). Vercel injects
 *   `DATABASE_URL`, which this module reads. `POSTGRES_URL` is accepted too.
 * - Local development: either pull the same variables with
 *   `vercel env pull .env.local`, or run `npm run db:local` for an embedded
 *   Postgres (PGlite) and use the local URL from `.env.example`.
 *
 * The schema is created automatically (idempotently) the first time a
 * server instance touches the database, so there is no separate migration
 * step. `npm run db:migrate` runs the same bootstrap on demand.
 *
 * Import from the data layer (`src/lib/data/*`) and scripts only - never from
 * client components. Do not import anything from `next/*` here so scripts can
 * use it under plain Node.
 *
 * Column conventions (kept from the original contract in `types.ts`):
 * timestamps are ISO-8601 UTC strings and date-only fields are "YYYY-MM-DD"
 * strings, stored as TEXT. Both sort and compare correctly as text.
 * `users.is_active` is BOOLEAN and `activity.meta` is JSONB, so the driver
 * returns a boolean and a parsed object respectively. COUNT(*) returns a
 * bigint (a string in node-postgres): always cast counts with `::int`.
 */

export type SqlParam = string | number | boolean | null | readonly string[];

export interface Queryable {
  /** Runs a statement and returns every row. Placeholders are `$1`, `$2`, ... */
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly SqlParam[],
  ): Promise<T[]>;
  /** Runs a statement and returns the first row, or null when there is none. */
  queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly SqlParam[],
  ): Promise<T | null>;
  /** Runs a statement and returns the number of affected rows. */
  execute(text: string, params?: readonly SqlParam[]): Promise<number>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  color         TEXT NOT NULL,
  job_title     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  parent_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'to_start'
               CHECK (status IN ('to_start','ongoing','on_hold','completed','cancelled')),
  priority     TEXT NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('low','medium','high','urgent')),
  owner_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  start_date   TEXT,
  due_date     TEXT,
  progress     INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  color        TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_owner  ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_due    ON projects(due_date);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at   TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);

CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at);
`;

/** Arbitrary constant key so concurrent cold starts don't race on CREATE TABLE. */
const SCHEMA_LOCK_KEY = 7_407_250_001;

declare global {
  // eslint-disable-next-line no-var
  var __prxPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __prxSchemaReady: Promise<void> | undefined;
}

/** The Postgres connection string, or a clear error explaining how to set one. */
export function getConnectionString(): string {
  const url = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL)?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Connect a Postgres database in Vercel (Storage → Neon) " +
        "and run `vercel env pull .env.local`, or start a local one with `npm run db:local`. " +
        "See README.md.",
    );
  }
  return url;
}

function poolSize(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(configured) && configured > 0 ? configured : 5;
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: getConnectionString(),
    max: poolSize(),
    // Short idle timeout suits serverless; attachDatabasePool keeps the
    // function alive just long enough to close idle clients on Vercel.
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
  });
  // An idle client dropped by the server must not crash the process.
  pool.on("error", (error) => {
    console.error("[db] idle client error:", error.message);
  });
  attachDatabasePool(pool);
  return pool;
}

/** Singleton pool; survives Next.js HMR via globalThis. */
function getPool(): Pool {
  if (!globalThis.__prxPool) globalThis.__prxPool = createPool();
  return globalThis.__prxPool;
}

async function runSchemaBootstrap(pool: Pool): Promise<void> {
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query(`BEGIN; SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY}); ${SCHEMA} COMMIT;`);
  } catch (error) {
    failed = true;
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    // Discard the connection after a failure instead of reusing a possibly broken one.
    client.release(failed);
  }
}

/**
 * Creates tables and indexes if they are missing. Runs once per server
 * instance; a failure is not cached, so the next request retries.
 */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__prxSchemaReady) {
    globalThis.__prxSchemaReady = runSchemaBootstrap(getPool()).catch((error: unknown) => {
      globalThis.__prxSchemaReady = undefined;
      throw error;
    });
  }
  return globalThis.__prxSchemaReady;
}

async function readyPool(): Promise<Pool> {
  const pool = getPool();
  await ensureSchema();
  return pool;
}

function toValues(params: readonly SqlParam[]): unknown[] {
  return params.map((param) => (Array.isArray(param) ? [...param] : param));
}

function wrapClient(client: Pool | PoolClient): Queryable {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params: readonly SqlParam[] = [],
    ): Promise<T[]> {
      const result = await client.query<T>(text, toValues(params));
      return result.rows;
    },
    async queryOne<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params: readonly SqlParam[] = [],
    ): Promise<T | null> {
      const result = await client.query<T>(text, toValues(params));
      return result.rows[0] ?? null;
    },
    async execute(text: string, params: readonly SqlParam[] = []): Promise<number> {
      const result = await client.query(text, toValues(params));
      return result.rowCount ?? 0;
    },
  };
}

/** Pool-backed queries (each statement may use a different connection). */
export const db: Queryable = {
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly SqlParam[],
  ): Promise<T[]> {
    return wrapClient(await readyPool()).query<T>(text, params);
  },
  async queryOne<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly SqlParam[],
  ): Promise<T | null> {
    return wrapClient(await readyPool()).queryOne<T>(text, params);
  },
  async execute(text: string, params?: readonly SqlParam[]): Promise<number> {
    return wrapClient(await readyPool()).execute(text, params);
  },
};

/**
 * Runs `fn` inside a single-connection transaction. Commits when it resolves,
 * rolls back and rethrows when it throws. Use the provided `tx` for every
 * statement that must be part of the transaction.
 */
export async function transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const pool = await readyPool();
  const client = await pool.connect();
  let failed = false;
  try {
    await client.query("BEGIN");
    const result = await fn(wrapClient(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    failed = true;
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    // Discard the connection after a failure instead of reusing a possibly broken
    // one. Errors are rare, so reconnecting costs little and keeps the pool healthy.
    client.release(failed);
  }
}

/** Lightweight connectivity probe for the health endpoint. */
export async function pingDatabase(): Promise<void> {
  await db.query("SELECT 1");
}

/** Closes the pool. Only for scripts (seed/migrate) so the process can exit. */
export async function closeDb(): Promise<void> {
  const pool = globalThis.__prxPool;
  globalThis.__prxPool = undefined;
  globalThis.__prxSchemaReady = undefined;
  if (pool) await pool.end();
}

export function newId(): string {
  return randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}
