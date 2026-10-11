/**
 * Shared domain types for PRX. This file is the contract between the data
 * layer, server actions and UI. Keep it dependency-free (no imports).
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
  "project_created",
  "project_updated",
  "status_changed",
  "progress_updated",
  "member_added",
  "member_removed",
  "comment_added",
  "subproject_created",
  "project_deleted",
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
}

export type UserSummary = Pick<User, "id" | "name" | "email" | "color" | "job_title">;

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
  /** 0-100, set manually. */
  progress: number;
  /** Optional hex accent colour for the project, e.g. "#f59e0b". */
  color: string | null;
  /** Manual ordering within the same parent (lower first). */
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** A project hydrated with the related data the UI needs to render a card/row. */
export interface ProjectWithMeta extends Project {
  owner: UserSummary | null;
  members: UserSummary[];
  /** Direct sub-projects only. */
  subproject_count: number;
  subproject_completed: number;
  comment_count: number;
  parent_name: string | null;
}

export interface ProjectTreeNode extends ProjectWithMeta {
  children: ProjectTreeNode[];
}

export interface ProjectAncestor {
  id: string;
  name: string;
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

/* ------------------------ Comments & activity -------------------- */

export interface Comment {
  id: string;
  project_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author: UserSummary;
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
