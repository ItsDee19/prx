import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * SQLite connection (better-sqlite3, synchronous). Import `getDb()` from the
 * data layer only - never from client components. The schema is created
 * on first open, so there is no separate migration step for a fresh install.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  color         TEXT NOT NULL,
  job_title     TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
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
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at);
`;

declare global {
  // eslint-disable-next-line no-var
  var __prxDb: Database.Database | undefined;
}

export function resolveDbPath(): string {
  const configured = process.env.PRX_DB_PATH?.trim();
  return configured
    ? path.resolve(process.cwd(), configured)
    : path.join(process.cwd(), "data", "prx.db");
}

function open(): Database.Database {
  const file = resolveDbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

/** Singleton connection; survives Next.js HMR via globalThis. */
export function getDb(): Database.Database {
  if (!globalThis.__prxDb) {
    globalThis.__prxDb = open();
  }
  return globalThis.__prxDb;
}

export function newId(): string {
  return randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}
