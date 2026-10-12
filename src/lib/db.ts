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
 *   `vercel env pull .env.local`, or run `npm run dev:local`, which starts an
 *   embedded Postgres (PGlite) in ./data/pglite and sets DATABASE_URL itself.
 *
 * The schema is created automatically (idempotently) the first time a
 * server instance touches the database, so there is no separate migration
 * step. `npm run db:migrate` runs the same bootstrap on demand. A database
 * whose `schema_version` row is already at SCHEMA_VERSION runs no DDL at all
 * (two cheap SELECTs per cold start); see runSchemaBootstrap.
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

/** v1 schema (unchanged). Never edit these statements; extend in SCHEMA_V2 or later. */
const SCHEMA_V1 = `
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

/**
 * v2 schema: the AvlysAI delivery model (clients, phases, tasks, collaboration,
 * time, scorecard, RAID, evals, data batches, views). See SPEC.md section 16.
 *
 * Rules for this block (and any later block):
 * - Versioned: the whole SCHEMA runs only while schema_version.version is
 *   below SCHEMA_VERSION (once per deploy that bumps it), under the advisory
 *   lock with lock_timeout 5s. BUMP SCHEMA_VERSION WHEN YOU APPEND OR CHANGE A
 *   BLOCK, otherwise already-migrated databases never see the change.
 * - Idempotent anyway (a bump re-runs every block): CREATE ... IF NOT EXISTS,
 *   ALTER TABLE ... ADD COLUMN IF NOT EXISTS (one ALTER per table so the lock
 *   is taken once), INSERT ... ON CONFLICT DO NOTHING. Constraints attached to
 *   ADD COLUMN IF NOT EXISTS only reach databases that do not have the column
 *   yet, so a constraint on an existing column needs its own idempotent form.
 * - Dependency-ordered: a table is created before anything references it.
 * - New columns on existing tables are nullable or have a default, so legacy
 *   rows stay valid. Existing projects keep progress_mode 'manual'.
 * - Enum CHECK lists mirror the `as const` arrays in src/lib/types.ts exactly.
 *   Column CHECKs get Postgres' default names (<table>_<column>_check).
 * - Money is INTEGER whole currency units (no paise/cents). Dates are
 *   "YYYY-MM-DD" TEXT, timestamps ISO-8601 TEXT, like v1.
 * - No extensions (PGlite compatible). No DO blocks.
 */
const SCHEMA_V2 = `
CREATE SEQUENCE IF NOT EXISTS task_number_seq;

-- Clients ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9]{1,5}$'),
  industry      TEXT NOT NULL DEFAULT '',
  region        TEXT NOT NULL DEFAULT 'india' CHECK (region IN ('india','international')),
  currency      TEXT NOT NULL DEFAULT 'INR' CHECK (currency IN ('INR','USD')),
  website       TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  contact_role  TEXT,
  systems       JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(systems) = 'array'),
  nda_signed    BOOLEAN NOT NULL DEFAULT FALSE,
  dpa_signed    BOOLEAN NOT NULL DEFAULT FALSE,
  confidential  BOOLEAN NOT NULL DEFAULT FALSE,
  color         TEXT NOT NULL,
  notes         TEXT NOT NULL DEFAULT '',
  archived_at   TEXT,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_created_by  ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_clients_name_prefix ON clients(lower(name) text_pattern_ops);

-- Workspace settings: exactly one row (id = 1). updated_by has no FK on
-- purpose so TRUNCATE users CASCADE cannot wipe this row.
CREATE TABLE IF NOT EXISTS app_settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  workspace_timezone  TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  usd_inr_rate        DOUBLE PRECISION NOT NULL DEFAULT 83 CHECK (usd_inr_rate > 0),
  default_tuning_days INTEGER NOT NULL DEFAULT 90 CHECK (default_tuning_days BETWEEN 0 AND 730),
  update_cadence_days INTEGER NOT NULL DEFAULT 7 CHECK (update_cadence_days BETWEEN 1 AND 60),
  labels_seeded_at    TEXT,
  updated_by          TEXT,
  updated_at          TEXT
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Engagement, delivery, budget and tuning fields on projects ----------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_id         TEXT REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_line      TEXT CHECK (service_line IN ('ai_integration','custom_software','ai_agents','ai_automation','data','consulting','internal')),
  ADD COLUMN IF NOT EXISTS engagement_type   TEXT CHECK (engagement_type IN ('fixed_price','retainer','time_and_materials','internal')),
  ADD COLUMN IF NOT EXISTS currency          TEXT CHECK (currency IN ('INR','USD')),
  ADD COLUMN IF NOT EXISTS contract_value    INTEGER CHECK (contract_value >= 0)
                                             CONSTRAINT projects_contract_value_currency_check CHECK (contract_value IS NULL OR currency IS NOT NULL),
  ADD COLUMN IF NOT EXISTS hourly_rate       INTEGER CHECK (hourly_rate >= 0)
                                             CONSTRAINT projects_hourly_rate_currency_check CHECK (hourly_rate IS NULL OR currency IS NOT NULL),
  ADD COLUMN IF NOT EXISTS delivery_state    TEXT NOT NULL DEFAULT 'not_started' CHECK (delivery_state IN ('not_started','prototype','pilot','production','handed_over','architecture_only')),
  ADD COLUMN IF NOT EXISTS progress_mode     TEXT NOT NULL DEFAULT 'manual' CHECK (progress_mode IN ('manual','tasks','milestones','batches')),
  ADD COLUMN IF NOT EXISTS budget_hours      INTEGER CHECK (budget_hours >= 0),
  ADD COLUMN IF NOT EXISTS budget_period     TEXT NOT NULL DEFAULT 'total' CHECK (budget_period IN ('total','monthly')),
  ADD COLUMN IF NOT EXISTS health            TEXT CHECK (health IN ('green','amber','red')),
  ADD COLUMN IF NOT EXISTS health_updated_at TEXT,
  ADD COLUMN IF NOT EXISTS go_live_date      TEXT,
  ADD COLUMN IF NOT EXISTS tuning_days       INTEGER NOT NULL DEFAULT 90 CHECK (tuning_days BETWEEN 0 AND 730),
  ADD COLUMN IF NOT EXISTS tuning_closed_at  TEXT,
  ADD COLUMN IF NOT EXISTS template_key      TEXT,
  ADD COLUMN IF NOT EXISTS source_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_client       ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_source       ON projects(source_project_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by   ON projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_service_line ON projects(service_line);
CREATE INDEX IF NOT EXISTS idx_projects_health       ON projects(health);
CREATE INDEX IF NOT EXISTS idx_projects_go_live      ON projects(go_live_date) WHERE go_live_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_name_prefix  ON projects(lower(name) text_pattern_ops);

-- Capacity (for workload) and admin-only internal cost rate (INR per hour).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS weekly_capacity_hours INTEGER NOT NULL DEFAULT 40 CHECK (weekly_capacity_hours BETWEEN 0 AND 168),
  ADD COLUMN IF NOT EXISTS cost_rate             INTEGER CHECK (cost_rate >= 0);

-- Milestones: delivery phases (kind 'phase') and point milestones ('milestone').
CREATE TABLE IF NOT EXISTS milestones (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  kind                TEXT NOT NULL DEFAULT 'phase' CHECK (kind IN ('phase','milestone')),
  phase_key           TEXT,
  position            INTEGER NOT NULL DEFAULT 0,
  start_date          TEXT,
  due_date            TEXT,
  status              TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','gate_review','done','stopped')),
  requires_gate       BOOLEAN NOT NULL DEFAULT FALSE,
  gate_decision       TEXT CHECK (gate_decision IN ('go','extend','stop')),
  gate_decided_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  gate_decided_at     TEXT,
  gate_notes          TEXT NOT NULL DEFAULT '',
  extend_count        INTEGER NOT NULL DEFAULT 0 CHECK (extend_count >= 0),
  client_signoff_name TEXT,
  client_signoff_date TEXT,
  evidence_url        TEXT,
  price               INTEGER CHECK (price >= 0),
  invoice_status      TEXT NOT NULL DEFAULT 'not_invoiced' CHECK (invoice_status IN ('not_invoiced','invoiced','paid')),
  completed_at        TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_milestones_project_position ON milestones(project_id, position);
CREATE INDEX IF NOT EXISTS idx_milestones_due              ON milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_milestones_status           ON milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_gate_decided_by  ON milestones(gate_decided_by);

-- Tasks: key is 'PRX-' || number (derived, never stored).
CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY,
  number           INTEGER NOT NULL UNIQUE DEFAULT nextval('task_number_seq'),
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id     TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  parent_task_id   TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','in_review','done','cancelled')),
  priority         TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  assignee_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  start_date       TEXT,
  due_date         TEXT,
  estimate_minutes INTEGER CHECK (estimate_minutes >= 0),
  is_deliverable   BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by_name TEXT,
  approved_on      TEXT,
  position         DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  completed_at     TEXT
);
-- Owned by the column so TRUNCATE ... RESTART IDENTITY restarts numbering.
ALTER SEQUENCE task_number_seq OWNED BY tasks.number;
CREATE INDEX IF NOT EXISTS idx_tasks_project_board   ON tasks(project_id, status, position);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due             ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone       ON tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent          ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by      ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_title_prefix    ON tasks(lower(title) text_pattern_ops);

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  done         BOOLEAN NOT NULL DEFAULT FALSE,
  position     INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id, position);

-- "task_id is blocked by blocked_by_id".
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_by_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (task_id, blocked_by_id),
  CHECK (task_id <> blocked_by_id)
);
CREATE INDEX IF NOT EXISTS idx_task_deps_blocked_by ON task_dependencies(blocked_by_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_created_by ON task_dependencies(created_by);

-- Task comments reuse comments (project_id stays the task's project).
ALTER TABLE comments ADD COLUMN IF NOT EXISTS task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

-- No FK on activity.task_id on purpose: 'task_deleted' entries keep the id.
ALTER TABLE activity ADD COLUMN IF NOT EXISTS task_id TEXT;
CREATE INDEX IF NOT EXISTS idx_activity_task  ON activity(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity(actor_id);

-- Labels ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS labels (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  label_group TEXT NOT NULL DEFAULT 'general' CHECK (label_group IN ('tech','domain','general')),
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_labels_name_lower ON labels(lower(name));
CREATE INDEX IF NOT EXISTS idx_labels_created_by ON labels(created_by);

CREATE TABLE IF NOT EXISTS project_labels (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label_id   TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_project_labels_label ON project_labels(label_id);

CREATE TABLE IF NOT EXISTS task_labels (
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id   TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_task_labels_label ON task_labels(label_id);

-- Watchers: exactly one of project_id / task_id. muted = explicit "Unwatch",
-- kept so auto-subscribe (INSERT ... ON CONFLICT DO NOTHING) cannot undo it.
CREATE TABLE IF NOT EXISTS subscriptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  task_id    TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  muted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  CHECK ((project_id IS NULL) <> (task_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_user_project ON subscriptions(user_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_user_task    ON subscriptions(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_project ON subscriptions(project_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_task    ON subscriptions(task_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('mention','assigned','comment','task_status','blocker_cleared','due_soon','gate_review','gate_decided','status_update','update_due','risk_assigned','tuning_ending','budget_threshold')),
  actor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  task_id    TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL,
  dedupe_key TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_inbox   ON notifications(user_id, read_at, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_actor   ON notifications(actor_id);
CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_task    ON notifications(task_id);
CREATE INDEX IF NOT EXISTS idx_notifications_comment ON notifications(comment_id);

-- Attachments: links always; files only when Vercel Blob is configured.
CREATE TABLE IF NOT EXISTS attachments (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  comment_id    TEXT REFERENCES comments(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('link','file')),
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  link_type     TEXT CHECK (link_type IN ('repo','staging','production','design','doc','drive','other')),
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  mime_type     TEXT,
  size_bytes    INTEGER CHECK (size_bytes >= 0),
  blob_pathname TEXT,
  uploaded_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  CHECK (kind = 'link' OR blob_pathname IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_attachments_project     ON attachments(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_task        ON attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_attachments_comment     ON attachments(comment_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by ON attachments(uploaded_by);

-- Time tracking --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_entries (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id      TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  entry_date   TEXT NOT NULL,
  minutes      INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
  billable     BOOLEAN NOT NULL DEFAULT TRUE,
  note         TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','timer','timesheet')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date    ON time_entries(user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_project_date ON time_entries(project_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_task         ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_milestone    ON time_entries(milestone_id);
-- One timesheet row per cell, so overlapping autosaves upsert instead of doubling minutes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_entries_timesheet_cell
  ON time_entries(user_id, project_id, COALESCE(task_id, ''), entry_date) WHERE source = 'timesheet';

-- A timer is running while stopped_at IS NULL (at most one per user).
CREATE TABLE IF NOT EXISTS timers (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  note          TEXT NOT NULL DEFAULT '',
  started_at    TEXT NOT NULL,
  stopped_at    TEXT,
  time_entry_id TEXT REFERENCES time_entries(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_timers_running ON timers(user_id) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_timers_user_started ON timers(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_timers_project      ON timers(project_id);
CREATE INDEX IF NOT EXISTS idx_timers_task         ON timers(task_id);
CREATE INDEX IF NOT EXISTS idx_timers_entry        ON timers(time_entry_id);

-- Custom engagement templates (built-ins live in src/lib/templates.ts).
CREATE TABLE IF NOT EXISTS project_templates (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  service_line      TEXT CHECK (service_line IN ('ai_integration','custom_software','ai_agents','ai_automation','data','consulting','internal')),
  payload           JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  source_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_templates_created_by ON project_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_project_templates_source     ON project_templates(source_project_id);

-- Success scorecard ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS success_metrics (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  unit                TEXT NOT NULL DEFAULT '',
  direction           TEXT NOT NULL DEFAULT 'higher' CHECK (direction IN ('higher','lower')),
  baseline            DOUBLE PRECISION,
  target              DOUBLE PRECISION NOT NULL,
  current             DOUBLE PRECISION,
  current_measured_at TEXT,
  locked_at           TEXT,
  position            INTEGER NOT NULL DEFAULT 0,
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_success_metrics_project ON success_metrics(project_id, position);
-- Eval trends, promote-to-champion and metric direction match metrics by name.
CREATE UNIQUE INDEX IF NOT EXISTS uq_success_metrics_project_name ON success_metrics(project_id, lower(name));

-- Weekly status updates (RAG). projects.health mirrors the latest one.
CREATE TABLE IF NOT EXISTS status_updates (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  week_of          TEXT NOT NULL,
  health           TEXT NOT NULL CHECK (health IN ('green','amber','red')),
  schedule_rag     TEXT CHECK (schedule_rag IN ('green','amber','red')),
  budget_rag       TEXT CHECK (budget_rag IN ('green','amber','red')),
  scope_rag        TEXT CHECK (scope_rag IN ('green','amber','red')),
  quality_rag      TEXT CHECK (quality_rag IN ('green','amber','red')),
  headline         TEXT NOT NULL CHECK (char_length(headline) BETWEEN 1 AND 140),
  done             TEXT NOT NULL DEFAULT '',
  next             TEXT NOT NULL DEFAULT '',
  blockers         TEXT NOT NULL DEFAULT '',
  client_asks      TEXT NOT NULL DEFAULT '',
  internal_notes   TEXT NOT NULL DEFAULT '',
  changes          JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(changes) = 'object'),
  metrics_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(metrics_snapshot) = 'array'),
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_status_updates_project ON status_updates(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_status_updates_week    ON status_updates(project_id, week_of);
CREATE INDEX IF NOT EXISTS idx_status_updates_author  ON status_updates(author_id);

-- RAID log -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'risk' CHECK (kind IN ('risk','assumption','issue','dependency','decision')),
  category    TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('data_access','data_quality','model_performance','hallucination_grounding','privacy_pii','security','compliance','bias_fairness','integration','vendor_model_churn','scope','client_dependency','schedule','budget','other')),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  likelihood  SMALLINT CHECK (likelihood BETWEEN 1 AND 5),
  impact      SMALLINT CHECK (impact BETWEEN 1 AND 5),
  owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  mitigation  TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigating','accepted','closed')),
  review_date TEXT,
  due_date    TEXT,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  closed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_risks_project_status ON risks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_risks_owner          ON risks(owner_id);
CREATE INDEX IF NOT EXISTS idx_risks_created_by     ON risks(created_by);
CREATE INDEX IF NOT EXISTS idx_risks_review         ON risks(review_date) WHERE status IN ('open','mitigating');

-- Evaluation log: at most one champion per project.
CREATE TABLE IF NOT EXISTS eval_runs (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id    TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  label           TEXT NOT NULL,
  change_type     TEXT NOT NULL DEFAULT 'prompt' CHECK (change_type IN ('prompt','model','retrieval','data','finetune','code','other')),
  model_name      TEXT NOT NULL DEFAULT '',
  prompt_version  TEXT NOT NULL DEFAULT '',
  dataset_version TEXT NOT NULL DEFAULT '',
  metrics         JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  verdict         TEXT NOT NULL DEFAULT 'candidate' CHECK (verdict IN ('baseline','candidate','champion','rejected','archived')),
  external_url    TEXT,
  notes           TEXT NOT NULL DEFAULT '',
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_eval_runs_champion ON eval_runs(project_id) WHERE verdict = 'champion';
CREATE INDEX IF NOT EXISTS idx_eval_runs_project    ON eval_runs(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_eval_runs_milestone  ON eval_runs(milestone_id);
CREATE INDEX IF NOT EXISTS idx_eval_runs_created_by ON eval_runs(created_by);

-- Avlys Data batches -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_batches (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id        TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  number              INTEGER NOT NULL CHECK (number >= 0),
  name                TEXT NOT NULL DEFAULT '',
  is_calibration      BOOLEAN NOT NULL DEFAULT FALSE,
  unit_type           TEXT NOT NULL DEFAULT 'records' CHECK (unit_type IN ('records','documents','images','audio_hours','video_episodes','other')),
  units_target        INTEGER NOT NULL CHECK (units_target > 0),
  units_delivered     INTEGER NOT NULL DEFAULT 0 CHECK (units_delivered >= 0),
  units_accepted      INTEGER NOT NULL DEFAULT 0 CHECK (units_accepted >= 0),
  guideline_version   TEXT NOT NULL DEFAULT '',
  gold_accuracy       DOUBLE PRECISION CHECK (gold_accuracy BETWEEN 0 AND 1),
  agreement_metric    TEXT CHECK (agreement_metric IN ('kappa','alpha','percent')),
  agreement_score     DOUBLE PRECISION,
  quality_threshold   DOUBLE PRECISION CHECK (quality_threshold BETWEEN 0 AND 1),
  agreement_threshold DOUBLE PRECISION,
  status              TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_production','in_review','accepted','rejected','rework')),
  due_date            TEXT,
  delivered_at        TEXT,
  accepted_at         TEXT,
  notes               TEXT NOT NULL DEFAULT '',
  created_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (project_id, number)
);
CREATE INDEX IF NOT EXISTS idx_data_batches_milestone  ON data_batches(milestone_id);
CREATE INDEX IF NOT EXISTS idx_data_batches_status     ON data_batches(project_id, status);
CREATE INDEX IF NOT EXISTS idx_data_batches_created_by ON data_batches(created_by);

-- Productivity -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_views (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL CHECK (scope IN ('projects','tasks','calendar','timeline','reports')),
  name       TEXT NOT NULL,
  filters    JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  is_shared  BOOLEAN NOT NULL DEFAULT FALSE,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_views_user   ON saved_views(user_id, scope, position);
CREATE INDEX IF NOT EXISTS idx_saved_views_shared ON saved_views(scope) WHERE is_shared;

CREATE TABLE IF NOT EXISTS favorites (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_project       ON favorites(project_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_position ON favorites(user_id, position);

-- Bootstrap bookkeeping: one row (id = 1). No FK, so TRUNCATE ... CASCADE
-- leaves it alone. Written by runSchemaBootstrap, not here.
CREATE TABLE IF NOT EXISTS schema_version (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version    INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/** Full bootstrap: every block in order. Append new blocks here, never reorder. */
const SCHEMA = SCHEMA_V1 + SCHEMA_V2;

/**
 * Version of SCHEMA. Bump it whenever a block is appended or changed: a
 * database already at this version skips the bootstrap entirely.
 */
const SCHEMA_VERSION = 2;

/** Arbitrary constant key so concurrent cold starts don't race on CREATE TABLE. */
const SCHEMA_LOCK_KEY = 7_407_250_001;

/**
 * Bounds how long a migration waits for a table lock, so a slow reader can
 * never queue every request behind the bootstrap. A timeout fails the
 * bootstrap, which is not cached, so the next request retries.
 */
const SCHEMA_LOCK_TIMEOUT = "5s";

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
        "and run `vercel env pull .env.local`, or develop locally with `npm run dev:local`. " +
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

/** schema_version.version, or 0 when the table or its row does not exist yet. */
async function readSchemaVersion(client: PoolClient): Promise<number> {
  const table = await client.query<{ present: boolean }>(
    "SELECT to_regclass('schema_version') IS NOT NULL AS present",
  );
  if (!table.rows[0]?.present) return 0;
  const row = await client.query<{ version: number }>("SELECT version FROM schema_version WHERE id = 1");
  return row.rows[0]?.version ?? 0;
}

/**
 * Brings the database up to SCHEMA_VERSION.
 *
 * - Up to date (the normal cold start): two SELECTs, no transaction and no
 *   DDL, so no table locks that could block requests or deadlock with writes.
 * - Behind: one transaction that takes the advisory lock (waiting only for
 *   another instance's migration), re-checks the version, runs SCHEMA with a
 *   lock timeout and records the version.
 */
async function runSchemaBootstrap(pool: Pool): Promise<void> {
  const client = await pool.connect();
  let failed = false;
  try {
    if ((await readSchemaVersion(client)) >= SCHEMA_VERSION) return;

    // lock_timeout is set after the advisory lock on purpose: waiting for
    // another bootstrapper blocks nobody else, and its own DDL is bounded.
    await client.query(
      `BEGIN; SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY}); SET LOCAL lock_timeout = '${SCHEMA_LOCK_TIMEOUT}';`,
    );
    if ((await readSchemaVersion(client)) >= SCHEMA_VERSION) {
      await client.query("COMMIT");
      return;
    }
    await client.query(SCHEMA);
    await client.query(
      `INSERT INTO schema_version (id, version, updated_at) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE
         SET version = GREATEST(schema_version.version, EXCLUDED.version), updated_at = EXCLUDED.updated_at`,
      [SCHEMA_VERSION, nowISO()],
    );
    await client.query("COMMIT");
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
 * Creates or upgrades tables and indexes when schema_version is behind.
 * Runs once per server instance; a failure (including a lock timeout) is not
 * cached, so the next request retries.
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

/** Closes the pool. Only for scripts (e.g. migrate) so the process can exit. */
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
