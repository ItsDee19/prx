import type { ActivityType, Priority, ProjectStatus } from "./types";

export const APP_NAME = "PRX";
export const COMPANY_NAME = "AvlysAI";
export const APP_TAGLINE = "Project tracking for the AvlysAI team";

export const SESSION_COOKIE = "prx_session";
export const SESSION_DURATION_DAYS = 30;
export const DEFAULT_ALLOWED_EMAIL_DOMAINS = ["avlysai.com"];
export const MIN_PASSWORD_LENGTH = 8;

/** Colour tones used by <Badge>; each maps to light + dark classes inside the Badge component. */
export type BadgeTone =
  | "neutral"
  | "slate"
  | "blue"
  | "amber"
  | "green"
  | "red"
  | "violet"
  | "orange";

export interface StatusConfig {
  value: ProjectStatus;
  label: string;
  description: string;
  tone: BadgeTone;
  /** Tailwind class for a small coloured dot. */
  dotClass: string;
  order: number;
}

export const STATUS_CONFIG: Record<ProjectStatus, StatusConfig> = {
  to_start: {
    value: "to_start",
    label: "To Start",
    description: "Planned, not started yet",
    tone: "slate",
    dotClass: "bg-slate-400",
    order: 0,
  },
  ongoing: {
    value: "ongoing",
    label: "Ongoing",
    description: "Actively being worked on",
    tone: "blue",
    dotClass: "bg-blue-500",
    order: 1,
  },
  on_hold: {
    value: "on_hold",
    label: "On Hold",
    description: "Paused, waiting on something",
    tone: "amber",
    dotClass: "bg-amber-500",
    order: 2,
  },
  completed: {
    value: "completed",
    label: "Completed",
    description: "Delivered and closed",
    tone: "green",
    dotClass: "bg-emerald-500",
    order: 3,
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    description: "Stopped and will not be delivered",
    tone: "red",
    dotClass: "bg-rose-500",
    order: 4,
  },
};

export const STATUS_ORDER: ProjectStatus[] = [
  "to_start",
  "ongoing",
  "on_hold",
  "completed",
  "cancelled",
];

/** Statuses that count as "open" (not finished). */
export const OPEN_STATUSES: ProjectStatus[] = ["to_start", "ongoing", "on_hold"];

export interface PriorityConfig {
  value: Priority;
  label: string;
  tone: BadgeTone;
  /** Tailwind text colour class for the priority icon. */
  iconClass: string;
  order: number;
}

export const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  low: { value: "low", label: "Low", tone: "neutral", iconClass: "text-zinc-400", order: 0 },
  medium: { value: "medium", label: "Medium", tone: "blue", iconClass: "text-blue-500", order: 1 },
  high: { value: "high", label: "High", tone: "orange", iconClass: "text-orange-500", order: 2 },
  urgent: { value: "urgent", label: "Urgent", tone: "red", iconClass: "text-rose-500", order: 3 },
};

export const PRIORITY_ORDER: Priority[] = ["urgent", "high", "medium", "low"];

/** Avatar background colours (assigned to users on creation). */
export const AVATAR_COLORS = [
  "#5b5bd6",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

/** Optional accent colours a project can be tagged with. */
export const PROJECT_COLORS = [
  "#5b5bd6",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  project_created: "created the project",
  project_updated: "updated the project",
  status_changed: "changed the status",
  progress_updated: "updated progress",
  member_added: "added a member",
  member_removed: "removed a member",
  comment_added: "commented",
  subproject_created: "added a sub-project",
  project_deleted: "deleted a project",
};

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/projects", label: "Projects", icon: "FolderKanban" },
  { href: "/team", label: "Team", icon: "Users" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const;
