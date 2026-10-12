/**
 * Shared domain types for PRX. This file is the contract between the data
 * layer, server actions and UI. Keep it dependency-free (no imports).
 *
 * v1 (sections "Users" to "Action results") is unchanged except for the
 * additive v2 columns on User, Project, Comment and Activity. Everything from
 * "v2 enums" down is the AvlysAI delivery model (SPEC.md sections 16-24).
 *
 * Conventions: ids are UUID strings; timestamps (`*_at`) are ISO-8601 UTC
 * strings; date-only fields (`*_date`, `*_on`, `week_of`, `week_start`) are
 * "YYYY-MM-DD" strings; money is whole currency units (INTEGER) and always
 * travels with its currency; durations are integer minutes.
 */

export type Role = "admin" | "member";

export const PROJECT_STATUSES = [
  "to_start",
  "ongoing",
  "on_hold",
  "completed",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ACTIVITY_TYPES = [
  // v1
  "project_created",
  "project_updated",
  "status_changed",
  "progress_updated",
  "member_added",
  "member_removed",
  "comment_added",
  "subproject_created",
  "project_deleted",
  // v2: tasks
  "task_created",
  "task_updated",
  "task_status_changed",
  "task_assigned",
  "task_deleted",
  "tasks_bulk_updated",
  "tasks_bulk_deleted",
  "task_blockers_changed",
  "deliverable_approved",
  // v2: milestones and gates
  "milestone_created",
  "milestone_updated",
  "milestone_completed",
  "milestone_deleted",
  "milestones_reordered",
  "gate_requested",
  "gate_decided",
  // v2: scorecard
  "metric_added",
  "metric_updated",
  "metric_changed_after_lock",
  "metric_deleted",
  "metrics_locked",
  // v2: updates, risks, evals, batches
  "status_update_posted",
  "status_update_edited",
  "status_update_deleted",
  "risk_added",
  "risk_updated",
  "risk_converted",
  "risk_closed",
  "risk_deleted",
  "eval_logged",
  "eval_updated",
  "eval_deleted",
  "champion_promoted",
  "batch_added",
  "batch_updated",
  "batch_deleted",
  // v2: go-live and tuning
  "go_live_set",
  "go_live_cleared",
  "tuning_closed",
  // v2: files, templates, clients
  "attachment_added",
  "attachment_updated",
  "attachment_removed",
  "template_applied",
  "project_converted",
  "client_created",
  "client_updated",
  "client_deleted",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/* ----------------------------- Users ----------------------------- */

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Hex colour used for the avatar background, e.g. "#5b5bd6". */
  color: string;
  job_title: string | null;
  is_active: boolean;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  /** v2: hours per week used for workload and capacity (default 40). */
  weekly_capacity_hours: number;
}

export type UserSummary = Pick<User, "id" | "name" | "email" | "color" | "job_title">;

/**
 * v2: admin-only internal cost rate (INR per hour, whole rupees). Never part
 * of `User`, so it cannot reach a client component through a user prop.
 */
export interface UserCostRate {
  user_id: string;
  cost_rate: number | null;
}

/* ---------------------------- Projects --------------------------- */

export interface Project {
  id: string;
  /** null for top-level projects; otherwise the id of the parent project. */
  parent_id: string | null;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  owner_id: string | null;
  /** Date-only strings, "YYYY-MM-DD", or null. */
  start_date: string | null;
  due_date: string | null;
  /** 0-100. Set manually when progress_mode is "manual", otherwise derived. */
  progress: number;
  /** Optional hex accent colour for the project, e.g. "#f59e0b". */
  color: string | null;
  /** Manual ordering within the same parent (lower first). */
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;

  /* v2: engagement */
  client_id: string | null;
  service_line: ServiceLine | null;
  engagement_type: EngagementType | null;
  currency: Currency | null;
  /** ADMIN-ONLY. Whole units of `currency`. null unless loaded with includeCommercial. */
  contract_value: number | null;
  /** ADMIN-ONLY. Whole units of `currency` per hour (T&M). null unless includeCommercial. */
  hourly_rate: number | null;
  delivery_state: DeliveryState;
  /** Existing projects stay "manual"; new projects default to "tasks" (set by the action). */
  progress_mode: ProgressMode;
  /* v2: budget (hours, not money; visible to everyone) */
  budget_hours: number | null;
  budget_period: BudgetPeriod;
  /* v2: health, denormalised from the latest status update */
  health: RagHealth | null;
  health_updated_at: string | null;
  /* v2: go-live and tuning window */
  go_live_date: string | null;
  tuning_days: number;
  tuning_closed_at: string | null;
  /* v2: provenance */
  /** "builtin:<key>" or "custom:<id>" of the template applied at creation. */
  template_key: string | null;
  /** Project this one was converted from (assessment -> pilot, build -> retainer). */
  source_project_id: string | null;
}

/** Field names of Project that only admins may read or write. */
export const PROJECT_COMMERCIAL_FIELDS = ["contract_value", "hourly_rate"] as const;
export type ProjectCommercialField = (typeof PROJECT_COMMERCIAL_FIELDS)[number];

/** Minimal project reference used inside other entities (tasks, entries, report rows). */
export interface ProjectSummary {
  id: string;
  name: string;
  color: string | null;
  status: ProjectStatus;
  client_code: string | null;
}

/** A project hydrated with the related data the UI needs to render a card/row. */
export interface ProjectWithMeta extends Project {
  owner: UserSummary | null;
  members: UserSummary[];
  /** Direct sub-projects only. */
  subproject_count: number;
  subproject_completed: number;
  /** Project-level comments only (task comments excluded). */
  comment_count: number;
  parent_name: string | null;
  /* v2 */
  client: ClientSummary | null;
  labels: LabelSummary[];
  /** First phase (by position) whose status is "active" or "gate_review". */
  current_phase: MilestoneSummary | null;
  /** Tasks of this project excluding cancelled ones (any depth of subtasks). */
  task_count: number;
  task_done_count: number;
}

export interface ProjectTreeNode extends ProjectWithMeta {
  children: ProjectTreeNode[];
}

export interface ProjectAncestor {
  id: string;
  name: string;
}

/** v2: options for data-layer reads that may include admin-only fields. */
export interface ProjectQueryOptions {
  /** true only when the caller is an admin. Default false strips PROJECT_COMMERCIAL_FIELDS to null. */
  includeCommercial?: boolean;
}

export interface ProjectFilters {
  /**
   * null  -> only top-level projects (parent_id IS NULL)
   * string -> only direct children of that project
   * undefined -> no parent constraint (all projects at every depth)
   */
  parentId?: string | null;
  status?: ProjectStatus | ProjectStatus[];
  priority?: Priority;
  ownerId?: string;
  /** Projects where the user is owner, creator or member. */
  memberId?: string;
  /** Case-insensitive substring match on name or description. */
  search?: string;
  sort?: "updated" | "created" | "due_date" | "priority" | "name" | "position";
  limit?: number;
  /* v2 */
  clientId?: string;
  serviceLine?: ServiceLine | ServiceLine[];
  engagementType?: EngagementType | EngagementType[];
  deliveryState?: DeliveryState | DeliveryState[];
  health?: RagHealth | RagHealth[];
  /** Projects carrying ANY of these labels. */
  labelIds?: string[];
  /** Restrict to these project ids (favourites, bulk actions, saved views). */
  ids?: string[];
}

export interface ProjectStats {
  total: number;
  by_status: Record<ProjectStatus, number>;
  overdue: number;
  due_this_week: number;
  completed_last_30_days: number;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  status?: ProjectStatus;
  priority?: Priority;
  owner_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  progress?: number;
  color?: string | null;
  parent_id?: string | null;
  member_ids?: string[];
}

export type UpdateProjectInput = Partial<Omit<CreateProjectInput, "parent_id">>;

/**
 * v2 engagement fields accepted by createProject/updateProject alongside the
 * v1 inputs (kept separate so v1 callers keep compiling). Visible to everyone.
 * go_live_date and tuning_days are deliberately absent: the go-live date is
 * written only by setGoLiveDate (it has side effects on delivery_state and
 * phases), and tuning_days comes from the template / app settings at creation
 * and from setGoLiveDate afterwards.
 */
export interface ProjectEngagementInput {
  client_id?: string | null;
  service_line?: ServiceLine | null;
  engagement_type?: EngagementType | null;
  /** Required (directly or via the client) before contract_value / hourly_rate / phase prices are set. */
  currency?: Currency | null;
  delivery_state?: DeliveryState;
  progress_mode?: ProgressMode;
  budget_hours?: number | null;
  budget_period?: BudgetPeriod;
  /** Replaces the label set when provided. */
  label_ids?: string[];
}

/** v2 ADMIN-ONLY inputs. Actions reject them (not silently drop) for non-admins. */
export interface ProjectCommercialInput {
  contract_value?: number | null;
  hourly_rate?: number | null;
}

/**
 * v2 inputs set only by the templates/conversion flows (createProjectAction
 * ignores them; updates never accept them).
 */
export interface ProjectProvenanceInput {
  template_key?: string | null;
  source_project_id?: string | null;
  /** The template's tuning window. Omitted: createProject uses app_settings.default_tuning_days. */
  tuning_days?: number;
}

export type CreateProjectFullInput = CreateProjectInput &
  ProjectEngagementInput &
  ProjectCommercialInput &
  ProjectProvenanceInput;

export type UpdateProjectFullInput = UpdateProjectInput & ProjectEngagementInput & ProjectCommercialInput;

/* ------------------------ Comments & activity -------------------- */

export interface Comment {
  id: string;
  project_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author: UserSummary;
  /** v2: set for comments on a task (project_id is then the task's project). */
  task_id: string | null;
}

export interface Activity {
  id: string;
  /** null when the project no longer exists (e.g. deletion of a top-level project). */
  project_id: string | null;
  actor_id: string | null;
  type: ActivityType;
  /** Human readable sentence, e.g. "changed status from To Start to Ongoing". */
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
  actor: UserSummary | null;
  project_name: string | null;
  /** v2: the task this entry is about (kept after the task is deleted). */
  task_id: string | null;
  /** v2: "PRX-12" while the task exists, else null. */
  task_key: string | null;
  task_title: string | null;
}

/* --------------------------- Action results ---------------------- */

/** Return type for server actions invoked programmatically from client components. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** State shape for forms driven by React's useActionState. */
export interface FormState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Optional echo of submitted values so the form can stay filled after an error. */
  values?: Record<string, string>;
}

export const INITIAL_FORM_STATE: FormState = { ok: false };

/* ================================================================== */
/*                               v2 enums                              */
/* ================================================================== */
/* Each array mirrors a CHECK constraint in src/lib/db.ts exactly.      */

export const TASK_STATUSES = ["todo", "in_progress", "in_review", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const SERVICE_LINES = [
  "ai_integration",
  "custom_software",
  "ai_agents",
  "ai_automation",
  "data",
  "consulting",
  "internal",
] as const;
export type ServiceLine = (typeof SERVICE_LINES)[number];

export const ENGAGEMENT_TYPES = ["fixed_price", "retainer", "time_and_materials", "internal"] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export const DELIVERY_STATES = [
  "not_started",
  "prototype",
  "pilot",
  "production",
  "handed_over",
  "architecture_only",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export const PROGRESS_MODES = ["manual", "tasks", "milestones", "batches"] as const;
export type ProgressMode = (typeof PROGRESS_MODES)[number];

export const BUDGET_PERIODS = ["total", "monthly"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CLIENT_REGIONS = ["india", "international"] as const;
export type ClientRegion = (typeof CLIENT_REGIONS)[number];

export const RAG_HEALTHS = ["green", "amber", "red"] as const;
export type RagHealth = (typeof RAG_HEALTHS)[number];

export const MILESTONE_KINDS = ["phase", "milestone"] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export const MILESTONE_STATUSES = ["planned", "active", "gate_review", "done", "stopped"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const GATE_DECISIONS = ["go", "extend", "stop"] as const;
export type GateDecision = (typeof GATE_DECISIONS)[number];

export const INVOICE_STATUSES = ["not_invoiced", "invoiced", "paid"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const LABEL_GROUPS = ["tech", "domain", "general"] as const;
export type LabelGroup = (typeof LABEL_GROUPS)[number];

export const NOTIFICATION_TYPES = [
  "mention",
  "assigned",
  "comment",
  "task_status",
  "blocker_cleared",
  "due_soon",
  "gate_review",
  "gate_decided",
  "status_update",
  "update_due",
  "risk_assigned",
  "tuning_ending",
  "budget_threshold",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const SUBSCRIPTION_ENTITY_TYPES = ["project", "task"] as const;
export type SubscriptionEntityType = (typeof SUBSCRIPTION_ENTITY_TYPES)[number];

export const ATTACHMENT_KINDS = ["link", "file"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const LINK_TYPES = ["repo", "staging", "production", "design", "doc", "drive", "other"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const TIME_ENTRY_SOURCES = ["manual", "timer", "timesheet"] as const;
export type TimeEntrySource = (typeof TIME_ENTRY_SOURCES)[number];

export const METRIC_DIRECTIONS = ["higher", "lower"] as const;
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

export const RISK_KINDS = ["risk", "assumption", "issue", "dependency", "decision"] as const;
export type RiskKind = (typeof RISK_KINDS)[number];

export const RISK_CATEGORIES = [
  "data_access",
  "data_quality",
  "model_performance",
  "hallucination_grounding",
  "privacy_pii",
  "security",
  "compliance",
  "bias_fairness",
  "integration",
  "vendor_model_churn",
  "scope",
  "client_dependency",
  "schedule",
  "budget",
  "other",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_STATUSES = ["open", "mitigating", "accepted", "closed"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const EVAL_CHANGE_TYPES = ["prompt", "model", "retrieval", "data", "finetune", "code", "other"] as const;
export type EvalChangeType = (typeof EVAL_CHANGE_TYPES)[number];

export const EVAL_VERDICTS = ["baseline", "candidate", "champion", "rejected", "archived"] as const;
export type EvalVerdict = (typeof EVAL_VERDICTS)[number];

export const BATCH_UNIT_TYPES = [
  "records",
  "documents",
  "images",
  "audio_hours",
  "video_episodes",
  "other",
] as const;
export type BatchUnitType = (typeof BATCH_UNIT_TYPES)[number];

export const AGREEMENT_METRICS = ["kappa", "alpha", "percent"] as const;
export type AgreementMetric = (typeof AGREEMENT_METRICS)[number];

export const BATCH_STATUSES = [
  "planned",
  "in_production",
  "in_review",
  "accepted",
  "rejected",
  "rework",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const SAVED_VIEW_SCOPES = ["projects", "tasks", "calendar", "timeline", "reports"] as const;
export type SavedViewScope = (typeof SAVED_VIEW_SCOPES)[number];

/** Project detail tabs (URL: /projects/[id]?tab=<id>; default "overview"). */
export const PROJECT_TAB_IDS = [
  "overview",
  "tasks",
  "timeline",
  "updates",
  "risks",
  "evals",
  "batches",
  "time",
  "files",
  "activity",
] as const;
export type ProjectTabId = (typeof PROJECT_TAB_IDS)[number];

/** Row counts the project page loads once (tab badges and tab visibility predicates). */
export interface ProjectTabCounts {
  /** Non-cancelled tasks. */
  tasks: number;
  milestones: number;
  status_updates: number;
  /** Open + mitigating RAID items. */
  open_risks: number;
  eval_runs: number;
  batches: number;
  time_entries: number;
  attachments: number;
}

/**
 * Client-side commands dispatched by the command palette and keyboard
 * shortcuts and handled by feature "hosts" mounted in GlobalOverlays
 * (see dispatchAppCommand / subscribeAppCommands in utils.ts).
 */
export type AppCommand =
  | { type: "open-palette" }
  | { type: "open-shortcuts" }
  | { type: "new-task"; projectId?: string; status?: TaskStatus; dueDate?: string; milestoneId?: string }
  | { type: "new-project"; parentId?: string }
  | { type: "new-client" }
  | { type: "toggle-timer" }
  | { type: "log-time"; projectId?: string; taskId?: string };

/* ================================================================== */
/*                       Clients and app settings                      */
/* ================================================================== */

export interface Client {
  id: string;
  name: string;
  /** 2-6 chars, uppercase letter first, A-Z0-9 (e.g. "HOSP"). Unique. */
  code: string;
  industry: string;
  region: ClientRegion;
  /** Default currency for new engagements of this client. */
  currency: Currency;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_role: string | null;
  /** Systems the client runs, e.g. ["HubSpot", "Zendesk"]. */
  systems: string[];
  nda_signed: boolean;
  dpa_signed: boolean;
  confidential: boolean;
  color: string;
  notes: string;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientSummary = Pick<Client, "id" | "name" | "code" | "color" | "currency" | "confidential">;

/** Per-currency totals. Both keys are always present (0 when none). Never add INR to USD. */
export type CurrencyTotals = Record<Currency, number>;

/** ADMIN-ONLY money roll-up of a client's top-level engagements. */
export interface ClientCommercialSummary {
  /** Sum of contract_value of every top-level engagement. */
  contracted: CurrencyTotals;
  /** Same, open engagements only (status to_start/ongoing/on_hold). */
  active_contracted: CurrencyTotals;
  /** Sum of milestone price with invoice_status invoiced or paid. */
  invoiced: CurrencyTotals;
  /** Sum of milestone price with invoice_status paid. */
  paid: CurrencyTotals;
}

export interface ClientWithMeta extends Client {
  /** Top-level projects linked to the client. */
  project_count: number;
  active_project_count: number;
  /** Latest health of open top-level engagements. */
  health_counts: Record<RagHealth, number>;
  logged_minutes: number;
  /** null unless loaded with includeCommercial. */
  commercial: ClientCommercialSummary | null;
}

export interface ClientFilters {
  search?: string;
  industry?: string;
  region?: ClientRegion;
  includeArchived?: boolean;
}

export interface CreateClientInput {
  name: string;
  code: string;
  industry?: string;
  region?: ClientRegion;
  currency?: Currency;
  website?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_role?: string | null;
  systems?: string[];
  nda_signed?: boolean;
  dpa_signed?: boolean;
  confidential?: boolean;
  color?: string;
  notes?: string;
}

export type UpdateClientInput = Partial<CreateClientInput> & {
  /** true sets archived_at, false clears it. */
  archived?: boolean;
};

export interface AppSettings {
  /** IANA zone used for every "today" (overdue, due soon, calendar, countdowns). */
  workspace_timezone: string;
  /** ADMIN-ONLY. USD to INR rate for approximate margin. null unless includeCommercial. */
  usd_inr_rate: number | null;
  default_tuning_days: number;
  /** Days without a status update before an active project shows "Update due". */
  update_cadence_days: number;
  labels_seeded_at: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export interface UpdateAppSettingsInput {
  workspace_timezone?: string;
  /** Admin-only. */
  usd_inr_rate?: number;
  default_tuning_days?: number;
  update_cadence_days?: number;
}

/* ================================================================== */
/*                                Labels                               */
/* ================================================================== */

export interface Label {
  id: string;
  name: string;
  color: string;
  label_group: LabelGroup;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type LabelSummary = Pick<Label, "id" | "name" | "color" | "label_group">;

export interface LabelWithUsage extends Label {
  project_count: number;
  task_count: number;
}

export interface CreateLabelInput {
  name: string;
  color?: string;
  label_group?: LabelGroup;
}

export type UpdateLabelInput = Partial<CreateLabelInput>;

/* ================================================================== */
/*                         Milestones and phases                       */
/* ================================================================== */

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string;
  kind: MilestoneKind;
  /** Template phase key ("audit", "pilot", "scale", ...) or null for ad-hoc milestones. */
  phase_key: string | null;
  position: number;
  start_date: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  requires_gate: boolean;
  gate_decision: GateDecision | null;
  gate_decided_by: string | null;
  gate_decided_at: string | null;
  gate_notes: string;
  extend_count: number;
  client_signoff_name: string | null;
  client_signoff_date: string | null;
  evidence_url: string | null;
  /** ADMIN-ONLY fixed price in the project's currency. null unless includeCommercial. */
  price: number | null;
  /** ADMIN-ONLY. null unless includeCommercial. */
  invoice_status: InvoiceStatus | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MilestoneSummary = Pick<
  Milestone,
  "id" | "project_id" | "name" | "kind" | "status" | "phase_key" | "start_date" | "due_date"
>;

export type MilestoneRef = Pick<Milestone, "id" | "name" | "kind">;

export interface MilestoneWithMeta extends Milestone {
  /** Non-cancelled tasks with this milestone_id. */
  task_count: number;
  task_done_count: number;
  deliverable_count: number;
  deliverable_done_count: number;
  /** round(100 * task_done_count / task_count); 100 when status is "done"; 0 without tasks. */
  progress: number;
  gate_decider: UserSummary | null;
}

export interface CreateMilestoneInput {
  project_id: string;
  name: string;
  description?: string;
  kind?: MilestoneKind;
  phase_key?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  status?: MilestoneStatus;
  requires_gate?: boolean;
  /** Admin-only. */
  price?: number | null;
  /** Admin-only. */
  invoice_status?: InvoiceStatus;
}

export type UpdateMilestoneInput = Partial<Omit<CreateMilestoneInput, "project_id">> & {
  gate_notes?: string;
  client_signoff_name?: string | null;
  client_signoff_date?: string | null;
  evidence_url?: string | null;
};

export interface GateDecisionInput {
  decision: GateDecision;
  notes: string;
  /** Required for "extend": what must be fixed before the next review. */
  fix_list?: string;
  /** Required for "extend": the new due date of the phase. */
  new_due_date?: string | null;
  client_signoff_name?: string | null;
  client_signoff_date?: string | null;
  evidence_url?: string | null;
}

/* ================================================================== */
/*                                 Tasks                               */
/* ================================================================== */

export interface Task {
  id: string;
  /** Global sequence number; the display key is `PRX-${number}`. */
  number: number;
  /** Derived "PRX-142" (never stored). */
  key: string;
  project_id: string;
  milestone_id: string | null;
  /** One level of subtasks: a subtask's parent never has a parent itself. */
  parent_task_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  estimate_minutes: number | null;
  /** Client deliverable (counts toward phase deliverables and the handover checklist). */
  is_deliverable: boolean;
  /** Who on the client side approved the deliverable, and on which date. */
  approved_by_name: string | null;
  approved_on: string | null;
  /** Fractional order inside a status column (lower first). */
  position: number;
  /** The reporter. */
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Minimal task reference (links, dependency chips, time entries). */
export type TaskRef = Pick<Task, "id" | "number" | "key" | "title" | "status" | "project_id">;

export interface TaskWithMeta extends Task {
  assignee: UserSummary | null;
  project: ProjectSummary;
  milestone: MilestoneRef | null;
  labels: LabelSummary[];
  checklist_total: number;
  checklist_done: number;
  subtask_count: number;
  subtask_done_count: number;
  comment_count: number;
  attachment_count: number;
  /** true while any blocker is not done/cancelled. */
  is_blocked: boolean;
  logged_minutes: number;
}

export interface TaskChecklistItem {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskDetail extends TaskWithMeta {
  creator: UserSummary | null;
  parent: TaskRef | null;
  checklist: TaskChecklistItem[];
  subtasks: TaskWithMeta[];
  /** Tasks this one is blocked by. */
  blocked_by: TaskRef[];
  /** Tasks blocked by this one. */
  blocking: TaskRef[];
  /** Latest TASK_DETAIL_ACTIVITY_LIMIT entries for this task, newest first (listTaskActivity). */
  activity: Activity[];
}

export type TaskSort = "position" | "due_date" | "priority" | "updated" | "created" | "number";

export interface TaskFilters {
  projectId?: string;
  projectIds?: string[];
  clientId?: string;
  /** null = tasks without a milestone. */
  milestoneId?: string | null;
  /** null = top-level tasks only; a string = subtasks of that task; undefined = any. */
  parentTaskId?: string | null;
  /** null = unassigned. */
  assigneeId?: string | null;
  createdBy?: string;
  status?: TaskStatus | TaskStatus[];
  priority?: Priority | Priority[];
  /** Tasks carrying ANY of these labels. */
  labelIds?: string[];
  isDeliverable?: boolean;
  /** Title/description substring, or an exact "PRX-<n>" key. */
  search?: string;
  /** Inclusive "YYYY-MM-DD" bounds on due_date. */
  dueFrom?: string;
  dueTo?: string;
  hasDueDate?: boolean;
  ids?: string[];
  /** Default "position" (board order). */
  sort?: TaskSort;
  limit?: number;
}

export interface CreateTaskInput {
  project_id: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  assignee_id?: string | null;
  milestone_id?: string | null;
  parent_task_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  estimate_minutes?: number | null;
  is_deliverable?: boolean;
  label_ids?: string[];
  /** Initial checklist item titles. */
  checklist?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  assignee_id?: string | null;
  milestone_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  estimate_minutes?: number | null;
  is_deliverable?: boolean;
  approved_by_name?: string | null;
  approved_on?: string | null;
  /** Replaces the label set when provided. */
  label_ids?: string[];
}

/** Board drop: new status plus the neighbours it landed between (null = column edge). */
export interface MoveTaskInput {
  status: TaskStatus;
  before_id?: string | null;
  after_id?: string | null;
}

export interface BulkTaskPatch {
  status?: TaskStatus;
  assignee_id?: string | null;
  priority?: Priority;
  milestone_id?: string | null;
  due_date?: string | null;
  add_label_ids?: string[];
  remove_label_ids?: string[];
}

export interface BulkProjectPatch {
  status?: ProjectStatus;
  owner_id?: string | null;
  priority?: Priority;
  add_label_ids?: string[];
  remove_label_ids?: string[];
}

export interface BulkResult {
  /** Rows changed. */
  updated: number;
  /** Projects touched (for revalidation and one summarising activity entry each). */
  project_ids: string[];
  /** Rows changed per project id (tasks of that project; 1 per project for project bulk actions). */
  per_project: Record<string, number>;
  /** Tasks changed (empty for project bulk actions). */
  task_ids: string[];
  /**
   * Tasks whose assignee became patch.assignee_id in this call (tasks already
   * assigned to that user are excluded), for one grouped "assigned" notification.
   */
  newly_assigned_ids: string[];
  /** Tasks that became done in this call (for blocker_cleared notifications). */
  completed_ids: string[];
}

/** bulkDeleteTasks: also returns the Vercel Blob URLs of file attachments removed by the cascade. */
export interface BulkDeleteResult extends BulkResult {
  blob_urls: string[];
}

export type MyTaskGroup = "overdue" | "today" | "this_week" | "later" | "no_date";

/** Optional narrowing for listMyTasks (the /tasks page's ?label= and ?project= filters). */
export interface MyTaskFilters {
  labelIds?: string[];
  projectId?: string;
}

/**
 * Workspace date context passed from server pages to client components that
 * show due/overdue or "Update due" state (serialisable; never derived from
 * new Date() in render). See isUpdateDue() in utils.ts.
 */
export interface WorkspaceDateContext {
  /** Workspace today, "YYYY-MM-DD". */
  today: string;
  /** IANA zone used to turn timestamps into workspace dates. */
  timeZone: string;
  /** app_settings.update_cadence_days. */
  cadenceDays: number;
}

/* ================================================================== */
/*                 Notifications, watchers and attachments             */
/* ================================================================== */

export interface Subscription {
  id: string;
  user_id: string;
  entity_type: SubscriptionEntityType;
  entity_id: string;
  /** true = explicit "Unwatch" (kept so auto-subscribe cannot re-add the user). */
  muted: boolean;
  created_at: string;
}

/** Something a user can watch. */
export interface WatchEntity {
  type: SubscriptionEntityType;
  id: string;
}

/** Named AppNotification to avoid shadowing the DOM `Notification` global. */
export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id: string | null;
  project_id: string | null;
  task_id: string | null;
  comment_id: string | null;
  title: string;
  body: string;
  /** In-app path, e.g. "/tasks/PRX-12" or "/projects/<id>?tab=updates". */
  url: string;
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
  actor: UserSummary | null;
  project_name: string | null;
  task_key: string | null;
}

export type InboxTab = "unread" | "mentions" | "all";

export interface NotificationFilters {
  tab?: InboxTab;
  limit?: number;
  /** created_at cursor: only notifications older than this. */
  before?: string;
}

export interface NotifyInput {
  /** User ids. The actor and inactive users are removed; duplicates collapse. */
  recipients: string[];
  type: NotificationType;
  actor_id: string | null;
  project_id?: string | null;
  task_id?: string | null;
  comment_id?: string | null;
  title: string;
  body?: string;
  url: string;
  /** Per recipient; a second notify with the same key is a no-op. */
  dedupe_key?: string | null;
}

export interface Attachment {
  id: string;
  project_id: string;
  task_id: string | null;
  comment_id: string | null;
  kind: AttachmentKind;
  name: string;
  url: string;
  link_type: LinkType | null;
  /** Shown in the overview "Key links" row. */
  pinned: boolean;
  mime_type: string | null;
  size_bytes: number | null;
  blob_pathname: string | null;
  uploaded_by: string | null;
  created_at: string;
  uploader: UserSummary | null;
}

export interface AttachmentFilters {
  projectId: string;
  /** null = project-level only; a string = that task's; undefined = all of the project. */
  taskId?: string | null;
  kind?: AttachmentKind;
  pinned?: boolean;
}

export interface CreateLinkAttachmentInput {
  project_id: string;
  task_id?: string | null;
  comment_id?: string | null;
  /** Defaults to the URL host. */
  name?: string;
  /** http(s) only. */
  url: string;
  /** Auto-detected from the host when omitted (see detectLinkType). */
  link_type?: LinkType | null;
  pinned?: boolean;
}

export interface CreateFileAttachmentInput {
  project_id: string;
  task_id?: string | null;
  comment_id?: string | null;
  name: string;
  /** Must be a https://*.blob.vercel-storage.com URL under attachments/<project_id>/. */
  url: string;
  blob_pathname: string;
  mime_type: string;
  size_bytes: number;
}

/* ================================================================== */
/*                         Search, calendar, timeline                  */
/* ================================================================== */

export type SearchHitKind = "project" | "task" | "client" | "person" | "comment";

export interface SearchHit {
  kind: SearchHitKind;
  id: string;
  title: string;
  /** Project name for tasks, industry for clients, email for people, snippet for comments. */
  subtitle: string | null;
  href: string;
  /** "PRX-12" for tasks, client code for clients/projects. */
  badge: string | null;
  color: string | null;
}

export interface SearchResults {
  query: string;
  projects: SearchHit[];
  tasks: SearchHit[];
  clients: SearchHit[];
  people: SearchHit[];
  comments: SearchHit[];
}

export type CalendarItemKind = "task" | "milestone" | "project_due" | "go_live" | "tuning_end";

interface CalendarItemBase {
  /** Unique across kinds, e.g. "task:<uuid>". */
  id: string;
  entity_id: string;
  date: string;
  title: string;
  project_id: string;
  project_name: string;
  project_color: string | null;
  client_code: string | null;
  href: string;
}

export interface CalendarTaskItem extends CalendarItemBase {
  kind: "task";
  task_key: string;
  status: TaskStatus;
  priority: Priority;
  assignee: UserSummary | null;
}

export interface CalendarMilestoneItem extends CalendarItemBase {
  kind: "milestone";
  milestone_kind: MilestoneKind;
  status: MilestoneStatus;
  requires_gate: boolean;
}

export interface CalendarProjectDueItem extends CalendarItemBase {
  kind: "project_due";
  status: ProjectStatus;
}

export interface CalendarGoLiveItem extends CalendarItemBase {
  kind: "go_live";
}

export interface CalendarTuningEndItem extends CalendarItemBase {
  kind: "tuning_end";
  tuning_days: number;
}

export type CalendarItem =
  | CalendarTaskItem
  | CalendarMilestoneItem
  | CalendarProjectDueItem
  | CalendarGoLiveItem
  | CalendarTuningEndItem;

export interface CalendarFilters {
  /** Inclusive "YYYY-MM-DD" range. */
  from: string;
  to: string;
  scope: "mine" | "all";
  /** The viewer; "mine" = tasks assigned to them plus items of projects they own/created/are a member of. */
  userId: string;
  projectId?: string;
  clientId?: string;
  labelId?: string;
}

export interface TimelineMilestone {
  id: string;
  name: string;
  kind: MilestoneKind;
  status: MilestoneStatus;
  requires_gate: boolean;
  start_date: string | null;
  due_date: string | null;
  position: number;
}

export interface TimelineProject {
  id: string;
  name: string;
  color: string | null;
  status: ProjectStatus;
  progress: number;
  health: RagHealth | null;
  service_line: ServiceLine | null;
  start_date: string | null;
  due_date: string | null;
  go_live_date: string | null;
  tuning_days: number;
  /** go_live_date + tuning_days, or null. */
  tuning_end_date: string | null;
  tuning_closed_at: string | null;
  client: ClientSummary | null;
  owner: UserSummary | null;
  milestones: TimelineMilestone[];
}

export interface TimelineGroup {
  /** null = projects without a client. */
  client: ClientSummary | null;
  projects: TimelineProject[];
}

export interface TimelineData {
  groups: TimelineGroup[];
  /** Projects with neither start_date nor due_date. */
  unscheduled: TimelineProject[];
  /** Earliest and latest date across scheduled bars, milestones and tuning ends. */
  range: { start: string; end: string } | null;
}

export interface TimelineFilters {
  clientId?: string;
  includeClosed?: boolean;
  /** Only projects where this user is owner, creator or member. */
  memberId?: string;
  labelId?: string;
}

export interface TimelineTask {
  id: string;
  key: string;
  title: string;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  assignee: UserSummary | null;
}

export interface ProjectTimelineRow {
  /** null = tasks without a milestone. */
  milestone: TimelineMilestone | null;
  tasks: TimelineTask[];
}

export interface ProjectTimelineData {
  project: TimelineProject;
  rows: ProjectTimelineRow[];
}

/* ================================================================== */
/*                              Time tracking                          */
/* ================================================================== */

export interface TimeEntry {
  id: string;
  user_id: string;
  project_id: string;
  task_id: string | null;
  milestone_id: string | null;
  entry_date: string;
  minutes: number;
  billable: boolean;
  note: string;
  source: TimeEntrySource;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryWithMeta extends TimeEntry {
  user: UserSummary;
  project: ProjectSummary;
  task: TaskRef | null;
  milestone_name: string | null;
}

export interface TimeEntryFilters {
  userId?: string;
  projectId?: string;
  clientId?: string;
  taskId?: string;
  milestoneId?: string;
  /** Inclusive "YYYY-MM-DD" bounds on entry_date. */
  from?: string;
  to?: string;
  billable?: boolean;
  limit?: number;
}

export interface LogTimeInput {
  project_id: string;
  task_id?: string | null;
  entry_date: string;
  minutes: number;
  /** Defaults to false when the project's engagement_type is "internal", else true. */
  billable?: boolean;
  note?: string;
  source?: TimeEntrySource;
}

export type UpdateTimeEntryInput = Partial<Omit<LogTimeInput, "source">>;

export interface Timer {
  id: string;
  user_id: string;
  project_id: string;
  task_id: string | null;
  note: string;
  started_at: string;
  /** null while running. */
  stopped_at: string | null;
  /** Entry created when the timer stopped (cleared again by undo). */
  time_entry_id: string | null;
}

export interface RunningTimer extends Timer {
  project: ProjectSummary;
  task: TaskRef | null;
}

export interface StartTimerInput {
  project_id: string;
  task_id?: string | null;
  note?: string;
}

export interface TimesheetRow {
  /** `${project_id}:${task_id ?? ""}` */
  key: string;
  project: ProjectSummary;
  task: TaskRef | null;
  /** Seven values, Monday..Sunday. */
  minutes: number[];
  total: number;
}

export interface TimesheetWeek {
  user_id: string;
  /** Monday. */
  week_start: string;
  /** Seven dates, Monday..Sunday. */
  days: string[];
  rows: TimesheetRow[];
  day_totals: number[];
  total: number;
}

export interface TimesheetCellInput {
  project_id: string;
  task_id?: string | null;
  entry_date: string;
  /** New total for the cell; 0 clears it. */
  minutes: number;
}

export type BudgetThreshold = 0 | 75 | 90 | 100;

export interface BudgetBurn {
  budget_hours: number;
  period: BudgetPeriod;
  /** First day of the current month for "monthly", else the project start_date (or null). */
  period_start: string | null;
  logged_minutes: number;
  /** round(100 * logged / budget). May exceed 100. */
  burn_pct: number;
  /** Elapsed share of the planned period, or null when dates are missing. */
  elapsed_pct: number | null;
  /** burn_pct - elapsed_pct > RUNNING_HOT_MARGIN. */
  running_hot: boolean;
  /** Highest threshold crossed (0, 75, 90, 100). */
  threshold: BudgetThreshold;
}

export interface ProjectTimeSummary {
  total_minutes: number;
  billable_minutes: number;
  by_user: { user: UserSummary; minutes: number; billable_minutes: number }[];
  by_milestone: { milestone: MilestoneRef | null; minutes: number }[];
  by_task: { task: TaskRef; estimate_minutes: number | null; logged_minutes: number }[];
  budget: BudgetBurn | null;
}

/* ================================================================== */
/*                               Templates                             */
/* ================================================================== */
/* Built-ins live in src/lib/templates.ts; custom ones in project_templates. */

export interface TemplateTask {
  title: string;
  description?: string;
  is_deliverable: boolean;
  /** Days after the milestone's start. */
  offset_days: number;
  duration_days: number;
  estimate_minutes: number | null;
  checklist: string[];
}

export interface TemplateMilestone {
  /** Stored as milestones.phase_key. */
  key: string;
  name: string;
  kind: MilestoneKind;
  /** Days after the project start. */
  offset_days: number;
  /** 0 for point milestones. */
  duration_days: number;
  requires_gate: boolean;
  description: string;
  /** The post-go-live tuning window (excluded from the build duration label). */
  is_tuning?: boolean;
  tasks: TemplateTask[];
}

export interface TemplateMetric {
  name: string;
  unit: string;
  direction: MetricDirection;
  baseline?: number | null;
  /** Draft target to agree with the client during Audit (success_metrics.target is required). */
  target: number;
}

export interface TemplateRisk {
  kind: RiskKind;
  category: RiskCategory;
  title: string;
  description?: string;
  likelihood?: number | null;
  impact?: number | null;
  mitigation?: string;
}

export interface TemplatePayload {
  progress_mode: ProgressMode;
  engagement_type: EngagementType | null;
  /** Default service line (null = let the user pick from the template's service_lines). */
  service_line: ServiceLine | null;
  delivery_state: DeliveryState;
  budget_period: BudgetPeriod;
  tuning_days: number;
  milestones: TemplateMilestone[];
  metrics: TemplateMetric[];
  risks: TemplateRisk[];
  /** Labels attached when they exist (matched case-insensitively, created as "general" otherwise). */
  label_names: string[];
}

/** A custom template row (project_templates). */
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  service_line: ServiceLine | null;
  payload: TemplatePayload;
  source_project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectTemplateInput {
  name: string;
  description?: string;
  service_line?: ServiceLine | null;
  payload: TemplatePayload;
  source_project_id?: string | null;
}

export type UpdateProjectTemplateInput = Partial<Pick<CreateProjectTemplateInput, "name" | "description" | "service_line">>;

/* ================================================================== */
/*                     Scorecard, gates, go-live                       */
/* ================================================================== */

export interface SuccessMetric {
  id: string;
  project_id: string;
  name: string;
  unit: string;
  direction: MetricDirection;
  baseline: number | null;
  target: number;
  current: number | null;
  current_measured_at: string | null;
  /** Set when the scorecard is locked (before the Pilot starts). */
  locked_at: string | null;
  position: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MetricTrendPoint {
  /** Eval run label. */
  label: string;
  value: number;
  created_at: string;
  is_champion: boolean;
}

export interface SuccessMetricWithStatus extends SuccessMetric {
  /** null when current is null. See metricIsMet(). */
  is_met: boolean | null;
  /** 0-100 from baseline toward target, null when not computable. See metricProgress(). */
  progress_pct: number | null;
  /** Values of the eval-run metric with the same name, oldest first. */
  trend: MetricTrendPoint[];
}

export interface CreateMetricInput {
  project_id: string;
  name: string;
  unit?: string;
  direction?: MetricDirection;
  baseline?: number | null;
  target: number;
  current?: number | null;
  notes?: string;
}

export type UpdateMetricInput = Partial<Omit<CreateMetricInput, "project_id">> & {
  /** Required when baseline or target change after locked_at. */
  reason?: string;
};

/** activity.meta of a "gate_requested" entry (ties the entry to its phase for gate history). */
export interface GateRequestedMeta {
  milestone_id: string;
  milestone_name: string;
}

/** activity.meta of a "gate_decided" entry. listGateHistory() reads these. Never contains amounts. */
export interface GateDecidedMeta extends GateRequestedMeta {
  decision: GateDecision;
  /** extend_count after the decision. */
  extend_count: number;
  /** "extend" only. */
  new_due_date: string | null;
  /** "extend" only. */
  fix_list: string | null;
  metrics: MetricSnapshot[];
  signoff: { name: string | null; date: string | null };
  evidence_url: string | null;
}

/** Everything the GateDialog needs, loaded in one call. */
export interface GateReviewData {
  milestone: MilestoneWithMeta;
  project: ProjectSummary;
  deliverables: TaskWithMeta[];
  metrics: SuccessMetricWithStatus[];
  champion: EvalRunWithMeta | null;
  /** Open/mitigating risks with score >= RISK_SCORE_RED. */
  open_high_risks: RiskWithMeta[];
  /** false after one extension (extend_count >= 1). */
  can_extend: boolean;
  next_phase: MilestoneSummary | null;
  /** gate_requested / gate_decided entries of this phase, newest first (listGateHistory). */
  history: Activity[];
}

export interface GoLiveSummary {
  project_id: string;
  go_live_date: string | null;
  tuning_days: number;
  tuning_end_date: string | null;
  /** Days since go-live (workspace today), null before go-live. */
  days_elapsed: number | null;
  /** Days until tuning_end_date (negative when past), null before go-live. */
  days_left: number | null;
  tuning_closed_at: string | null;
  /**
   * Non-cancelled deliverable tasks of the phase with phase_key HANDOVER_PHASE_KEY
   * ("scale"): the handover checklist (one deliverable per handover item).
   */
  handover_total: number;
  handover_done: number;
  scale_milestone_id: string | null;
  /** Open tuning window with days_left <= TUNING_ALERT_DAYS. */
  can_propose_retainer: boolean;
}

/* ================================================================== */
/*                       Status updates and risks                      */
/* ================================================================== */

export interface StatusUpdateChanges {
  /** created_at of the previous update, or null for the first one. */
  since: string | null;
  tasks_completed: number;
  /** Names of milestones completed since `since`. */
  milestones_done: string[];
  progress_from: number | null;
  progress_to: number;
  due_date_from: string | null;
  due_date_to: string | null;
  risks_opened: number;
}

export interface MetricSnapshot {
  name: string;
  unit: string;
  direction: MetricDirection;
  baseline: number | null;
  target: number;
  current: number | null;
  is_met: boolean | null;
}

export interface StatusUpdate {
  id: string;
  project_id: string;
  author_id: string | null;
  /** Monday of the workspace-timezone week the update was posted in. */
  week_of: string;
  health: RagHealth;
  schedule_rag: RagHealth | null;
  budget_rag: RagHealth | null;
  scope_rag: RagHealth | null;
  quality_rag: RagHealth | null;
  /** 1-140 chars. */
  headline: string;
  done: string;
  next: string;
  blockers: string;
  client_asks: string;
  /** Never included in "Copy for client". */
  internal_notes: string;
  changes: StatusUpdateChanges;
  metrics_snapshot: MetricSnapshot[];
  created_at: string;
  updated_at: string;
  author: UserSummary | null;
}

export interface CreateStatusUpdateInput {
  project_id: string;
  health: RagHealth;
  schedule_rag?: RagHealth | null;
  budget_rag?: RagHealth | null;
  scope_rag?: RagHealth | null;
  quality_rag?: RagHealth | null;
  headline: string;
  done?: string;
  next?: string;
  blockers?: string;
  client_asks?: string;
  internal_notes?: string;
}

export type UpdateStatusUpdateInput = Partial<Omit<CreateStatusUpdateInput, "project_id">>;

/** Composer preview: what changed since the last update, plus a suggested budget RAG. */
export interface StatusUpdateDraft {
  week_of: string;
  changes: StatusUpdateChanges;
  /** From budget burn: >= 100% red, >= 90% or running hot amber, else green; null without a budget. */
  suggested_budget_rag: RagHealth | null;
  last_update: StatusUpdate | null;
}

export interface Risk {
  id: string;
  project_id: string;
  kind: RiskKind;
  category: RiskCategory;
  title: string;
  description: string;
  /** 1-5 or null. */
  likelihood: number | null;
  /** 1-5 or null. */
  impact: number | null;
  owner_id: string | null;
  mitigation: string;
  status: RiskStatus;
  review_date: string | null;
  /** "Confirm by" date for dependencies and assumptions. */
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface RiskWithMeta extends Risk {
  owner: UserSummary | null;
  project_name: string;
  /** likelihood x impact, null when either is missing. */
  score: number | null;
  /** From score: >= 15 red, 8-14 amber, < 8 green. */
  severity: RagHealth | null;
}

export interface RiskFilters {
  projectId?: string;
  kind?: RiskKind | RiskKind[];
  status?: RiskStatus | RiskStatus[];
  category?: RiskCategory;
  ownerId?: string;
  likelihood?: number;
  impact?: number;
  minScore?: number;
  /** Open/mitigating risks whose review_date is on or before this date. */
  reviewDueBy?: string;
  limit?: number;
}

export interface CreateRiskInput {
  project_id: string;
  kind?: RiskKind;
  category?: RiskCategory;
  title: string;
  description?: string;
  likelihood?: number | null;
  impact?: number | null;
  owner_id?: string | null;
  mitigation?: string;
  status?: RiskStatus;
  review_date?: string | null;
  due_date?: string | null;
}

export type UpdateRiskInput = Partial<Omit<CreateRiskInput, "project_id">>;

export interface RiskHeatCell {
  likelihood: number;
  impact: number;
  count: number;
}

/* ================================================================== */
/*                         Evals and data batches                      */
/* ================================================================== */

/** Metric name -> value, e.g. { containment: 0.61, wer: 0.12, p95_ms: 1400 }. */
export type EvalMetrics = Record<string, number>;

export interface EvalRun {
  id: string;
  project_id: string;
  milestone_id: string | null;
  label: string;
  change_type: EvalChangeType;
  model_name: string;
  prompt_version: string;
  dataset_version: string;
  metrics: EvalMetrics;
  /** The champion is the run with verdict "champion" (at most one per project). */
  verdict: EvalVerdict;
  external_url: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
}

export interface EvalRunWithMeta extends EvalRun {
  creator: UserSummary | null;
  milestone_name: string | null;
  /** Metric name -> (this value - champion value); null when no champion or metric missing. */
  deltas: Record<string, number | null>;
}

export interface CreateEvalRunInput {
  project_id: string;
  milestone_id?: string | null;
  label: string;
  change_type?: EvalChangeType;
  model_name?: string;
  prompt_version?: string;
  dataset_version?: string;
  metrics: EvalMetrics;
  /** "champion" only via promotion; "archived" only via demotion. */
  verdict?: "baseline" | "candidate" | "rejected";
  external_url?: string | null;
  notes?: string;
}

export type UpdateEvalRunInput = Partial<Omit<CreateEvalRunInput, "project_id">>;

export interface PromoteChampionResult {
  champion: EvalRun;
  /** The previous champion, now "archived". */
  archived_id: string | null;
  /** Scorecard metrics whose current value was updated from the champion. */
  metrics_updated: number;
}

export interface DataBatch {
  id: string;
  project_id: string;
  milestone_id: string | null;
  number: number;
  name: string;
  is_calibration: boolean;
  unit_type: BatchUnitType;
  units_target: number;
  units_delivered: number;
  units_accepted: number;
  guideline_version: string;
  /** 0-1. */
  gold_accuracy: number | null;
  agreement_metric: AgreementMetric | null;
  agreement_score: number | null;
  /** 0-1 threshold for gold_accuracy. */
  quality_threshold: number | null;
  /** Threshold for agreement_score (same scale as the metric). */
  agreement_threshold: number | null;
  status: BatchStatus;
  due_date: string | null;
  delivered_at: string | null;
  accepted_at: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBatchInput {
  project_id: string;
  milestone_id?: string | null;
  /** Defaults to max(number) + 1 in the project. */
  number?: number;
  name?: string;
  is_calibration?: boolean;
  unit_type?: BatchUnitType;
  units_target: number;
  units_delivered?: number;
  units_accepted?: number;
  guideline_version?: string;
  gold_accuracy?: number | null;
  agreement_metric?: AgreementMetric | null;
  agreement_score?: number | null;
  quality_threshold?: number | null;
  agreement_threshold?: number | null;
  status?: BatchStatus;
  due_date?: string | null;
  notes?: string;
}

export type UpdateBatchInput = Partial<Omit<CreateBatchInput, "project_id">>;

export interface DataBatchSummary {
  batch_count: number;
  units_target: number;
  units_delivered: number;
  units_accepted: number;
  /** accepted / delivered, 0-1, null when nothing delivered. */
  acceptance_rate: number | null;
  /** Mean gold_accuracy of batches that have one, 0-1. */
  avg_gold_accuracy: number | null;
  /** quality_threshold of the calibration batch (or the latest batch with one). */
  quality_threshold: number | null;
  calibration: { exists: boolean; accepted: boolean };
  /** true when a non-calibration batch left "planned" before the calibration batch was accepted. */
  production_before_calibration: boolean;
  accepted_per_week: { week_start: string; units: number }[];
}

/* ================================================================== */
/*                      Saved views and favourites                     */
/* ================================================================== */

/** The page's URL search params (validated against the page's filter schema on load). */
export type SavedViewFilters = Record<string, string | string[]>;

export interface SavedView {
  id: string;
  user_id: string;
  scope: SavedViewScope;
  name: string;
  filters: SavedViewFilters;
  is_shared: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  owner: UserSummary;
}

export interface CreateSavedViewInput {
  scope: SavedViewScope;
  name: string;
  filters: SavedViewFilters;
  is_shared?: boolean;
}

export type UpdateSavedViewInput = Partial<Pick<CreateSavedViewInput, "name" | "filters" | "is_shared">>;

export interface FavoriteProject {
  project_id: string;
  name: string;
  color: string | null;
  status: ProjectStatus;
  health: RagHealth | null;
  client_code: string | null;
  position: number;
}

/* ================================================================== */
/*                           Reports and Home                          */
/* ================================================================== */

export interface ReportFilters {
  /** Inclusive "YYYY-MM-DD" range. */
  from: string;
  to: string;
  clientId?: string;
}

export interface PortfolioHealthReport {
  /** Open top-level projects by latest health ("none" = no update yet). */
  counts: Record<RagHealth | "none", number>;
  /** Red first, then amber, then stale (no update within update_cadence_days). */
  at_risk: ProjectWithMeta[];
}

export interface ServiceLineStatusRow {
  service_line: ServiceLine | null;
  counts: Record<ProjectStatus, number>;
}

export interface ThroughputPoint {
  week_start: string;
  created: number;
  completed: number;
}

export interface OverdueByAssigneeRow {
  /** null = unassigned. */
  user: UserSummary | null;
  count: number;
}

export interface HoursWeekPoint {
  week_start: string;
  billable_minutes: number;
  non_billable_minutes: number;
}

export interface HoursByClientRow {
  client: ClientSummary | null;
  minutes: number;
  billable_minutes: number;
}

export interface BurnRow {
  project: ProjectSummary;
  burn: BudgetBurn;
}

export interface WorkloadCell {
  week_start: string;
  /** Estimated minutes of open assigned tasks spread over working days. */
  minutes: number;
  capacity_minutes: number;
  /** round(100 * minutes / capacity_minutes); 0 when capacity is 0. */
  pct: number;
}

export interface WorkloadRow {
  user: UserSummary;
  weekly_capacity_hours: number;
  cells: WorkloadCell[];
}

/** ADMIN-ONLY. */
export interface ContractValueRow {
  engagement_type: EngagementType | null;
  currency: Currency;
  amount: number;
  project_count: number;
}

/** ADMIN-ONLY. */
export interface InvoiceStatusRow {
  currency: Currency;
  status: InvoiceStatus;
  amount: number;
  count: number;
}

/** ADMIN-ONLY. One phase of getProjectMargin (minutes logged against the phase vs its fixed price). */
export interface PhaseMarginRow {
  milestone: MilestoneRef;
  /** Fixed price in `currency`, or null when the phase has none. */
  price: number | null;
  /** The project's currency (null only when the project has no currency, and then price is null too). */
  currency: Currency | null;
  minutes: number;
  /** Sum over the phase's entries of minutes / 60 * user cost_rate. */
  cost_inr: number;
  /** price converted with usd_inr_rate minus cost_inr; null without a price. Approximate. */
  approx_margin_inr: number | null;
}

/** ADMIN-ONLY. getProjectMargin: project margin plus per-phase margin against fixed phase prices. */
export interface ProjectMargin {
  usd_inr_rate: number;
  /** null when the project has no contract value (or no currency). */
  project: MarginRow | null;
  /** Phases (kind "phase") by position. */
  phases: PhaseMarginRow[];
}

/** ADMIN-ONLY. Approximate: USD converted with app_settings.usd_inr_rate. */
export interface MarginRow {
  project: ProjectSummary;
  currency: Currency;
  contract_value: number;
  logged_minutes: number;
  /** Sum over entries of minutes / 60 * user cost_rate (users without a rate count 0). */
  cost_inr: number;
  contract_value_inr: number;
  approx_margin_inr: number;
  /** round(100 * margin / contract_value_inr), null when contract value is 0. */
  margin_pct: number | null;
  usd_inr_rate: number;
}

export interface HomeStats {
  /** Open top-level projects with a client. */
  active_engagements: number;
  my_open_tasks: number;
  my_overdue_tasks: number;
  hours_this_week_minutes: number;
  capacity_minutes: number;
  /** Open top-level projects with health red or amber. */
  at_risk_projects: number;
}

export interface GateAwaiting {
  milestone: MilestoneSummary;
  project: ProjectSummary;
  /** When the phase entered gate_review (its updated_at). */
  requested_at: string;
}

export interface MilestoneDue {
  milestone: MilestoneSummary;
  project: ProjectSummary;
  days_left: number;
}

export interface TuningWindow {
  project: ProjectSummary;
  go_live_date: string;
  end_date: string;
  tuning_days: number;
  days_left: number;
  handover_total: number;
  handover_done: number;
}

export interface StaleUpdate {
  project: ProjectSummary;
  owner: UserSummary | null;
  last_update_at: string | null;
  days_since: number | null;
}
