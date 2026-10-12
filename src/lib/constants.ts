import type {
  ActivityType,
  AgreementMetric,
  BatchStatus,
  BatchUnitType,
  BudgetPeriod,
  ClientRegion,
  Currency,
  DeliveryState,
  EngagementType,
  EvalChangeType,
  EvalVerdict,
  GateDecision,
  InvoiceStatus,
  LabelGroup,
  LinkType,
  MetricDirection,
  MilestoneKind,
  MilestoneStatus,
  NotificationType,
  Priority,
  ProgressMode,
  ProjectStatus,
  ProjectTabId,
  RagHealth,
  RiskCategory,
  RiskKind,
  RiskStatus,
  SavedViewScope,
  ServiceLine,
  TaskStatus,
  TimeEntrySource,
} from "./types";

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

/** Fallback verb phrases per activity type (entries carry their own `message`). */
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
  task_created: "created a task",
  task_updated: "updated a task",
  task_status_changed: "changed a task's status",
  task_assigned: "assigned a task",
  task_deleted: "deleted a task",
  tasks_bulk_updated: "updated several tasks",
  tasks_bulk_deleted: "deleted several tasks",
  task_blockers_changed: "changed a task's blockers",
  deliverable_approved: "recorded a client approval",
  milestone_created: "added a milestone",
  milestone_updated: "updated a milestone",
  milestone_completed: "completed a milestone",
  milestone_deleted: "deleted a milestone",
  milestones_reordered: "reordered the phases",
  gate_requested: "requested a gate review",
  gate_decided: "decided a gate",
  metric_added: "added a success metric",
  metric_updated: "updated a success metric",
  metric_changed_after_lock: "changed a locked success metric",
  metric_deleted: "removed a success metric",
  metrics_locked: "locked the scorecard",
  status_update_posted: "posted a status update",
  status_update_edited: "edited a status update",
  status_update_deleted: "deleted a status update",
  risk_added: "logged a risk",
  risk_updated: "updated a risk",
  risk_converted: "converted a risk to an issue",
  risk_closed: "closed a risk",
  risk_deleted: "deleted a risk",
  eval_logged: "logged an eval run",
  eval_updated: "updated an eval run",
  eval_deleted: "deleted an eval run",
  champion_promoted: "promoted a champion run",
  batch_added: "added a data batch",
  batch_updated: "updated a data batch",
  batch_deleted: "deleted a data batch",
  go_live_set: "set the go-live date",
  go_live_cleared: "cleared the go-live date",
  tuning_closed: "closed the tuning window",
  attachment_added: "added an attachment",
  attachment_updated: "updated an attachment",
  attachment_removed: "removed an attachment",
  template_applied: "applied a template",
  project_converted: "created a follow-on engagement",
  client_created: "created a client",
  client_updated: "updated a client",
  client_deleted: "deleted a client",
};

/**
 * @deprecated v1 flat navigation, kept so the current sidebar compiles until
 * the design agent switches it to NAV_CONFIG/NAV_GROUPS (SPEC.md section 20).
 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "LayoutDashboard" },
  { href: "/projects", label: "Projects", icon: "FolderKanban" },
  { href: "/team", label: "Team", icon: "Users" },
  { href: "/settings", label: "Settings", icon: "Settings" },
] as const;

/* ================================================================== */
/*                                 Icons                               */
/* ================================================================== */

/**
 * Every lucide-react icon referenced by name in configs (this file and
 * src/lib/templates.ts) plus a few shared UI names. UI resolves names with one
 * `Record<IconName, LucideIcon>` map (src/components/ui/icon.tsx, owned by the
 * design agent) so a missing icon is a type error. Add a name here before
 * using it in a config. lucide-react 1.x has no brand icons (no Github/Figma):
 * use GitBranch / PenTool instead.
 */
export const ICON_NAMES = [
  // navigation
  "House",
  "LayoutDashboard",
  "ListChecks",
  "Inbox",
  "FolderKanban",
  "Building2",
  "CalendarDays",
  "ChartGantt",
  "Clock",
  "ChartColumn",
  "Users",
  "Settings",
  // project tabs
  "LayoutGrid",
  "SquareKanban",
  "Megaphone",
  "ShieldAlert",
  "FlaskConical",
  "Database",
  "Timer",
  "Paperclip",
  "Activity",
  // task statuses
  "Circle",
  "CircleDot",
  "Eye",
  "CircleCheck",
  "CircleX",
  // service lines
  "Plug",
  "Code",
  "Bot",
  "Workflow",
  "Lightbulb",
  // engagement types
  "Lock",
  "Repeat",
  "Hourglass",
  // delivery states and progress modes
  "CircleDashed",
  "Shapes",
  "Rocket",
  "Handshake",
  "Layers",
  "SlidersHorizontal",
  "Flag",
  // currency and regions
  "IndianRupee",
  "DollarSign",
  "MapPin",
  "Globe",
  // RAG
  "TriangleAlert",
  "OctagonAlert",
  // milestones and gates
  "Diamond",
  "Gavel",
  "Ban",
  "Receipt",
  "BadgeCheck",
  // labels
  "Cpu",
  "Tag",
  // notifications
  "AtSign",
  "UserPlus",
  "MessageSquare",
  "Unlock",
  "CalendarClock",
  "Gauge",
  // links
  "GitBranch",
  "Server",
  "PenTool",
  "FileText",
  "HardDrive",
  "Link",
  // time entry sources
  "Pencil",
  "Table",
  // metrics
  "TrendingUp",
  "TrendingDown",
  // risk kinds and categories
  "CircleHelp",
  "Waypoints",
  "KeyRound",
  "Sparkles",
  "UserLock",
  "ShieldCheck",
  "Scale",
  "Network",
  "Shuffle",
  "Maximize2",
  "CalendarX",
  "Wallet",
  "Ellipsis",
  // eval change types and verdicts
  "MessageSquareText",
  "Search",
  "Wrench",
  "Star",
  "Archive",
  "Anchor",
  // batches
  "Image",
  "AudioLines",
  "Video",
  "FileStack",
  "Boxes",
  "RotateCcw",
  // misc
  "Keyboard",
  "Bookmark",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

/* ================================================================== */
/*                         Shared config shapes                        */
/* ================================================================== */

/** Display config for an enum value: label + tone + icon + order (always pair colour with the label). */
export interface OptionConfig<T extends string> {
  value: T;
  label: string;
  description: string;
  tone: BadgeTone;
  icon: IconName;
  /** Display order (ascending). */
  order: number;
}

/** Option config with a solid dot colour (statuses that render a dot). */
export interface DotOptionConfig<T extends string> extends OptionConfig<T> {
  /** Tailwind background class for a small dot. */
  dotClass: string;
}

/** Sorts the keys of a config map by `order`. */
function orderOf<T extends string>(config: Record<T, { order: number }>): T[] {
  return (Object.keys(config) as T[]).sort((a, b) => config[a].order - config[b].order);
}

/* ================================================================== */
/*                                 Tasks                               */
/* ================================================================== */

export const TASK_KEY_PREFIX = "PRX";

export const TASK_STATUS_CONFIG: Record<TaskStatus, DotOptionConfig<TaskStatus>> = {
  todo: {
    value: "todo",
    label: "Todo",
    description: "Not started",
    tone: "slate",
    icon: "Circle",
    dotClass: "bg-slate-400",
    order: 0,
  },
  in_progress: {
    value: "in_progress",
    label: "In progress",
    description: "Being worked on",
    tone: "blue",
    icon: "CircleDot",
    dotClass: "bg-blue-500",
    order: 1,
  },
  in_review: {
    value: "in_review",
    label: "In review",
    description: "Waiting for review or client feedback",
    tone: "violet",
    icon: "Eye",
    dotClass: "bg-violet-500",
    order: 2,
  },
  done: {
    value: "done",
    label: "Done",
    description: "Finished",
    tone: "green",
    icon: "CircleCheck",
    dotClass: "bg-emerald-500",
    order: 3,
  },
  cancelled: {
    value: "cancelled",
    label: "Cancelled",
    description: "Will not be done",
    tone: "neutral",
    icon: "CircleX",
    dotClass: "bg-zinc-400",
    order: 4,
  },
};

export const TASK_STATUS_ORDER: TaskStatus[] = orderOf(TASK_STATUS_CONFIG);
export const OPEN_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review"];
export const CLOSED_TASK_STATUSES: TaskStatus[] = ["done", "cancelled"];

/** Board columns; "cancelled" renders collapsed. */
export const TASK_BOARD_COLUMNS: TaskStatus[] = ["todo", "in_progress", "in_review", "done", "cancelled"];

/** Rebalance a status column's positions when two neighbours are closer than this. */
export const TASK_POSITION_MIN_GAP = 1e-6;
/** Gap used when appending to the end of a column or rebalancing. */
export const TASK_POSITION_STEP = 1024;

/** Upper bound of ids per bulk action. */
export const MAX_BULK_IDS = 200;

/** TaskDetail.activity holds this many latest entries. */
export const TASK_DETAIL_ACTIVITY_LIMIT = 30;

/* ================================================================== */
/*                       Engagement and commercials                    */
/* ================================================================== */

export const SERVICE_LINE_CONFIG: Record<ServiceLine, OptionConfig<ServiceLine>> = {
  ai_integration: {
    value: "ai_integration",
    label: "AI integration",
    description: "Copilots, RAG and document pipelines inside ERP/CRM systems.",
    tone: "blue",
    icon: "Plug",
    order: 0,
  },
  custom_software: {
    value: "custom_software",
    label: "Custom software",
    description: "Platforms, portals, internal tools and marketplaces.",
    tone: "slate",
    icon: "Code",
    order: 1,
  },
  ai_agents: {
    value: "ai_agents",
    label: "AI agents",
    description: "Support, sales, voice and multi-agent systems.",
    tone: "violet",
    icon: "Bot",
    order: 2,
  },
  ai_automation: {
    value: "ai_automation",
    label: "AI automation",
    description: "Lead routing, triage and operations glue with n8n or Zapier.",
    tone: "orange",
    icon: "Workflow",
    order: 3,
  },
  data: {
    value: "data",
    label: "Avlys Data",
    description: "AI training data: collection, annotation and gold-set QA.",
    tone: "green",
    icon: "Database",
    order: 4,
  },
  consulting: {
    value: "consulting",
    label: "AI consulting",
    description: "Fixed-price readiness assessments ending in a costed roadmap.",
    tone: "amber",
    icon: "Lightbulb",
    order: 5,
  },
  internal: {
    value: "internal",
    label: "Internal",
    description: "AvlysAI's own work. Not client-billable.",
    tone: "neutral",
    icon: "Building2",
    order: 6,
  },
};

export const SERVICE_LINE_ORDER: ServiceLine[] = orderOf(SERVICE_LINE_CONFIG);
/** The project Evals tab shows for these service lines (or whenever runs exist). */
export const EVAL_SERVICE_LINES: ServiceLine[] = ["ai_integration", "ai_agents", "ai_automation", "data"];
/** The project Batches tab shows for these service lines (or whenever batches exist). */
export const BATCH_SERVICE_LINES: ServiceLine[] = ["data"];
/**
 * Service lines without a go-live / tuning window. The overview go-live card
 * is hidden for them unless the project already has a go_live_date.
 */
export const NO_GO_LIVE_SERVICE_LINES: ServiceLine[] = ["consulting", "data", "internal"];

export const ENGAGEMENT_TYPE_CONFIG: Record<EngagementType, OptionConfig<EngagementType>> = {
  fixed_price: {
    value: "fixed_price",
    label: "Fixed price",
    description: "Fixed scope, priced phase by phase before work begins.",
    tone: "blue",
    icon: "Lock",
    order: 0,
  },
  retainer: {
    value: "retainer",
    label: "Retainer",
    description: "Ongoing monthly engagement with an hours budget.",
    tone: "violet",
    icon: "Repeat",
    order: 1,
  },
  time_and_materials: {
    value: "time_and_materials",
    label: "Time & materials",
    description: "Billed by the hour at an agreed rate.",
    tone: "amber",
    icon: "Hourglass",
    order: 2,
  },
  internal: {
    value: "internal",
    label: "Internal",
    description: "No billing. Time defaults to non-billable.",
    tone: "neutral",
    icon: "Building2",
    order: 3,
  },
};

export const ENGAGEMENT_TYPE_ORDER: EngagementType[] = orderOf(ENGAGEMENT_TYPE_CONFIG);

export const DELIVERY_STATE_CONFIG: Record<DeliveryState, OptionConfig<DeliveryState>> = {
  not_started: {
    value: "not_started",
    label: "Not started",
    description: "Nothing delivered yet.",
    tone: "neutral",
    icon: "CircleDashed",
    order: 0,
  },
  prototype: {
    value: "prototype",
    label: "Prototype",
    description: "Prototype or MVP delivered.",
    tone: "violet",
    icon: "Shapes",
    order: 1,
  },
  pilot: {
    value: "pilot",
    label: "Pilot",
    description: "Fixed-scope pilot running on real cases.",
    tone: "blue",
    icon: "FlaskConical",
    order: 2,
  },
  production: {
    value: "production",
    label: "In production",
    description: "Live. The tuning window counts down from go-live.",
    tone: "green",
    icon: "Rocket",
    order: 3,
  },
  handed_over: {
    value: "handed_over",
    label: "Handed over",
    description: "Tuning closed and handover complete.",
    tone: "slate",
    icon: "Handshake",
    order: 4,
  },
  architecture_only: {
    value: "architecture_only",
    label: "Architecture only",
    description: "Architecture engagement; no build.",
    tone: "amber",
    icon: "Layers",
    order: 5,
  },
};

export const DELIVERY_STATE_ORDER: DeliveryState[] = orderOf(DELIVERY_STATE_CONFIG);

export const PROGRESS_MODE_CONFIG: Record<ProgressMode, OptionConfig<ProgressMode>> = {
  manual: {
    value: "manual",
    label: "Manual",
    description: "Progress is set by hand.",
    tone: "neutral",
    icon: "SlidersHorizontal",
    order: 0,
  },
  tasks: {
    value: "tasks",
    label: "From tasks",
    description: "Done tasks out of all non-cancelled tasks.",
    tone: "blue",
    icon: "ListChecks",
    order: 1,
  },
  milestones: {
    value: "milestones",
    label: "From phases",
    description: "Done phases out of all phases.",
    tone: "violet",
    icon: "Flag",
    order: 2,
  },
  batches: {
    value: "batches",
    label: "From accepted units",
    description: "Accepted units out of target units across data batches.",
    tone: "green",
    icon: "Database",
    order: 3,
  },
};

export const PROGRESS_MODE_ORDER: ProgressMode[] = orderOf(PROGRESS_MODE_CONFIG);
/** progress_mode for projects created after v2 (existing rows keep "manual"). */
export const DEFAULT_NEW_PROJECT_PROGRESS_MODE: ProgressMode = "tasks";

export const BUDGET_PERIOD_CONFIG: Record<BudgetPeriod, { value: BudgetPeriod; label: string; description: string }> = {
  total: { value: "total", label: "Total", description: "Hours budget for the whole engagement." },
  monthly: { value: "monthly", label: "Per month", description: "Hours budget that resets every month." },
};

export interface CurrencyConfig {
  value: Currency;
  label: string;
  symbol: string;
  /** Intl locale used for grouping (en-IN gives lakh/crore grouping). */
  locale: string;
  icon: IconName;
  order: number;
}

export const CURRENCY_CONFIG: Record<Currency, CurrencyConfig> = {
  INR: { value: "INR", label: "Indian rupee", symbol: "₹", locale: "en-IN", icon: "IndianRupee", order: 0 },
  USD: { value: "USD", label: "US dollar", symbol: "$", locale: "en-US", icon: "DollarSign", order: 1 },
};

export const CURRENCY_ORDER: Currency[] = orderOf(CURRENCY_CONFIG);

export const CLIENT_REGION_CONFIG: Record<
  ClientRegion,
  { value: ClientRegion; label: string; shortLabel: string; defaultCurrency: Currency; icon: IconName; order: number }
> = {
  india: { value: "india", label: "India", shortLabel: "IN", defaultCurrency: "INR", icon: "MapPin", order: 0 },
  international: {
    value: "international",
    label: "International",
    shortLabel: "Intl",
    defaultCurrency: "USD",
    icon: "Globe",
    order: 1,
  },
};

/** Client code format (mirrors the CHECK in db.ts). */
export const CLIENT_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;

/** Colours offered for clients and labels. */
export const CLIENT_COLORS = [
  "#0071e3",
  "#6e56cf",
  "#0e7490",
  "#1a7f4b",
  "#b45309",
  "#d1242f",
  "#db2777",
  "#475569",
  "#ea580c",
  "#0891b2",
];

export const LABEL_COLORS = CLIENT_COLORS;

/* ================================================================== */
/*                               RAG health                            */
/* ================================================================== */

export interface RagConfig extends DotOptionConfig<RagHealth> {
  /** Higher = worse; sort descending to put red first. */
  severity: number;
}

export const RAG_CONFIG: Record<RagHealth, RagConfig> = {
  green: {
    value: "green",
    label: "On track",
    description: "No material issues.",
    tone: "green",
    icon: "CircleCheck",
    dotClass: "bg-success",
    order: 0,
    severity: 0,
  },
  amber: {
    value: "amber",
    label: "At risk",
    description: "Issues that need attention to stay on plan.",
    tone: "amber",
    icon: "TriangleAlert",
    dotClass: "bg-warning",
    order: 1,
    severity: 1,
  },
  red: {
    value: "red",
    label: "Off track",
    description: "Off plan; needs a decision or help.",
    tone: "red",
    icon: "OctagonAlert",
    dotClass: "bg-danger",
    order: 2,
    severity: 2,
  },
};

export const RAG_ORDER: RagHealth[] = orderOf(RAG_CONFIG);
/** Status-update dimensions with their own optional RAG. */
export const RAG_DIMENSIONS = [
  { key: "schedule_rag", label: "Schedule" },
  { key: "budget_rag", label: "Budget" },
  { key: "scope_rag", label: "Scope" },
  { key: "quality_rag", label: "Quality" },
] as const;

/* ================================================================== */
/*                         Milestones and gates                        */
/* ================================================================== */

export const MILESTONE_KIND_CONFIG: Record<MilestoneKind, OptionConfig<MilestoneKind>> = {
  phase: {
    value: "phase",
    label: "Phase",
    description: "A delivery phase with a date range, tasks and deliverables.",
    tone: "blue",
    icon: "Layers",
    order: 0,
  },
  milestone: {
    value: "milestone",
    label: "Milestone",
    description: "A point in time, e.g. go-live or a client demo.",
    tone: "violet",
    icon: "Diamond",
    order: 1,
  },
};

export const MILESTONE_STATUS_CONFIG: Record<MilestoneStatus, DotOptionConfig<MilestoneStatus>> = {
  planned: {
    value: "planned",
    label: "Planned",
    description: "Not started.",
    tone: "slate",
    icon: "CircleDashed",
    dotClass: "bg-slate-400",
    order: 0,
  },
  active: {
    value: "active",
    label: "Active",
    description: "In progress.",
    tone: "blue",
    icon: "CircleDot",
    dotClass: "bg-blue-500",
    order: 1,
  },
  gate_review: {
    value: "gate_review",
    label: "Gate review",
    description: "Awaiting a Go / Extend once / Stop decision.",
    tone: "amber",
    icon: "Gavel",
    dotClass: "bg-amber-500",
    order: 2,
  },
  done: {
    value: "done",
    label: "Done",
    description: "Completed or passed its gate.",
    tone: "green",
    icon: "CircleCheck",
    dotClass: "bg-emerald-500",
    order: 3,
  },
  stopped: {
    value: "stopped",
    label: "Stopped",
    description: "Stopped at its gate.",
    tone: "red",
    icon: "Ban",
    dotClass: "bg-rose-500",
    order: 4,
  },
};

export const MILESTONE_STATUS_ORDER: MilestoneStatus[] = orderOf(MILESTONE_STATUS_CONFIG);

export const GATE_DECISION_CONFIG: Record<GateDecision, OptionConfig<GateDecision>> = {
  go: {
    value: "go",
    label: "Go",
    description: "The phase passes and the next phase starts.",
    tone: "green",
    icon: "CircleCheck",
    order: 0,
  },
  extend: {
    value: "extend",
    label: "Extend once",
    description: "Fix a defined list by a new date. Allowed once per phase.",
    tone: "amber",
    icon: "Hourglass",
    order: 1,
  },
  stop: {
    value: "stop",
    label: "Stop",
    description: "Stop here. Consider putting the project on hold.",
    tone: "red",
    icon: "Ban",
    order: 2,
  },
};

/** A phase may be extended at most this many times. */
export const MAX_GATE_EXTENSIONS = 1;

export const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, OptionConfig<InvoiceStatus>> = {
  not_invoiced: {
    value: "not_invoiced",
    label: "Not invoiced",
    description: "Not billed yet.",
    tone: "neutral",
    icon: "Receipt",
    order: 0,
  },
  invoiced: {
    value: "invoiced",
    label: "Invoiced",
    description: "Invoice sent.",
    tone: "blue",
    icon: "Receipt",
    order: 1,
  },
  paid: {
    value: "paid",
    label: "Paid",
    description: "Payment received.",
    tone: "green",
    icon: "BadgeCheck",
    order: 2,
  },
};

/* ================================================================== */
/*                                 Labels                              */
/* ================================================================== */

export const LABEL_GROUP_CONFIG: Record<LabelGroup, OptionConfig<LabelGroup>> = {
  tech: {
    value: "tech",
    label: "Tech stack",
    description: "Models, frameworks, platforms and APIs.",
    tone: "blue",
    icon: "Cpu",
    order: 0,
  },
  domain: {
    value: "domain",
    label: "Domain",
    description: "Client industry.",
    tone: "violet",
    icon: "Building2",
    order: 1,
  },
  general: {
    value: "general",
    label: "General",
    description: "Anything else, e.g. eval, infra, client-blocker.",
    tone: "neutral",
    icon: "Tag",
    order: 2,
  },
};

export const LABEL_GROUP_ORDER: LabelGroup[] = orderOf(LABEL_GROUP_CONFIG);

export interface DefaultLabel {
  name: string;
  color: string;
  label_group: LabelGroup;
}

const LLM = "#6e56cf";
const FRAMEWORK = "#0071e3";
const RUNTIME = "#0e7490";
const DATA_STORE = "#1a7f4b";
const CLOUD = "#475569";
const COMMS = "#ea580c";
const AUTOMATION = "#b45309";
const COMMERCE = "#db2777";
const ENTERPRISE = "#0891b2";
const DOMAIN = "#d1242f";

/**
 * Inserted by ensureDefaultLabels() when the catalogue was never seeded or is
 * empty (SPEC.md section 17.4); individually deleted labels stay deleted.
 */
export const DEFAULT_LABELS: readonly DefaultLabel[] = [
  { name: "OpenAI", color: LLM, label_group: "tech" },
  { name: "Anthropic", color: LLM, label_group: "tech" },
  { name: "Gemini", color: LLM, label_group: "tech" },
  { name: "Groq", color: LLM, label_group: "tech" },
  { name: "Sarvam", color: LLM, label_group: "tech" },
  { name: "LangGraph", color: FRAMEWORK, label_group: "tech" },
  { name: "CrewAI", color: FRAMEWORK, label_group: "tech" },
  { name: "Next.js", color: FRAMEWORK, label_group: "tech" },
  { name: "React", color: FRAMEWORK, label_group: "tech" },
  { name: "Node.js", color: RUNTIME, label_group: "tech" },
  { name: "Python", color: RUNTIME, label_group: "tech" },
  { name: "FastAPI", color: RUNTIME, label_group: "tech" },
  { name: "PostgreSQL", color: DATA_STORE, label_group: "tech" },
  { name: "pgvector", color: DATA_STORE, label_group: "tech" },
  { name: "Supabase", color: DATA_STORE, label_group: "tech" },
  { name: "AWS", color: CLOUD, label_group: "tech" },
  { name: "Vercel", color: CLOUD, label_group: "tech" },
  { name: "Stripe", color: COMMERCE, label_group: "tech" },
  { name: "Twilio", color: COMMS, label_group: "tech" },
  { name: "Exotel", color: COMMS, label_group: "tech" },
  { name: "WhatsApp Business API", color: COMMS, label_group: "tech" },
  { name: "n8n", color: AUTOMATION, label_group: "tech" },
  { name: "Zapier", color: AUTOMATION, label_group: "tech" },
  { name: "Shopify", color: COMMERCE, label_group: "tech" },
  { name: "Webflow", color: COMMERCE, label_group: "tech" },
  { name: "Salesforce", color: ENTERPRISE, label_group: "tech" },
  { name: "HubSpot", color: ENTERPRISE, label_group: "tech" },
  { name: "SAP", color: ENTERPRISE, label_group: "tech" },
  { name: "Zendesk", color: ENTERPRISE, label_group: "tech" },
  { name: "Healthcare", color: DOMAIN, label_group: "domain" },
  { name: "Legal", color: DOMAIN, label_group: "domain" },
  { name: "Recruiting", color: DOMAIN, label_group: "domain" },
  { name: "Real estate", color: DOMAIN, label_group: "domain" },
  { name: "Fintech", color: DOMAIN, label_group: "domain" },
  { name: "D2C retail", color: DOMAIN, label_group: "domain" },
  { name: "F&B", color: DOMAIN, label_group: "domain" },
  { name: "Construction", color: DOMAIN, label_group: "domain" },
];

/* ================================================================== */
/*                     Notifications and attachments                   */
/* ================================================================== */

export const NOTIFICATION_TYPE_CONFIG: Record<NotificationType, OptionConfig<NotificationType>> = {
  mention: { value: "mention", label: "Mention", description: "Someone @mentioned you.", tone: "blue", icon: "AtSign", order: 0 },
  assigned: { value: "assigned", label: "Assigned", description: "A task was assigned to you.", tone: "blue", icon: "UserPlus", order: 1 },
  comment: { value: "comment", label: "Comment", description: "New comment on something you watch.", tone: "neutral", icon: "MessageSquare", order: 2 },
  task_status: { value: "task_status", label: "Status change", description: "A task you watch changed status.", tone: "neutral", icon: "CircleDot", order: 3 },
  blocker_cleared: { value: "blocker_cleared", label: "Blocker cleared", description: "A task blocking yours is done.", tone: "green", icon: "Unlock", order: 4 },
  due_soon: { value: "due_soon", label: "Due soon", description: "Your task is due tomorrow.", tone: "amber", icon: "CalendarClock", order: 5 },
  gate_review: { value: "gate_review", label: "Gate review", description: "A phase is awaiting a gate decision.", tone: "amber", icon: "Gavel", order: 6 },
  gate_decided: { value: "gate_decided", label: "Gate decided", description: "A gate decision was recorded.", tone: "violet", icon: "Flag", order: 7 },
  status_update: { value: "status_update", label: "Status update", description: "A status update was posted.", tone: "neutral", icon: "Megaphone", order: 8 },
  update_due: { value: "update_due", label: "Update due", description: "Your project needs a status update.", tone: "amber", icon: "Clock", order: 9 },
  risk_assigned: { value: "risk_assigned", label: "Risk assigned", description: "You own a risk.", tone: "orange", icon: "ShieldAlert", order: 10 },
  tuning_ending: { value: "tuning_ending", label: "Tuning ending", description: "A tuning window ends soon.", tone: "amber", icon: "Hourglass", order: 11 },
  budget_threshold: { value: "budget_threshold", label: "Budget", description: "Budget burn crossed a threshold.", tone: "red", icon: "Gauge", order: 12 },
};

/** Unread count polling interval while the tab is visible. */
export const NOTIFICATION_POLL_MS = 60_000;
/** Read notifications older than this are pruned lazily. */
export const NOTIFICATION_RETENTION_DAYS = 90;
/** Bell popover shows this many latest notifications. */
export const NOTIFICATION_POPOVER_LIMIT = 10;

/**
 * Mentions are stored inline in comment bodies as `@[Name](user:<uuid>)`.
 * Use parseMentions()/renderable helpers in utils.ts; never re-implement.
 */
export const MENTION_PATTERN_SOURCE = String.raw`@\[([^\]\n]{1,80})\]\(user:([0-9a-fA-F-]{36})\)`;

export const LINK_TYPE_CONFIG: Record<LinkType, OptionConfig<LinkType>> = {
  repo: { value: "repo", label: "Repo", description: "Source repository.", tone: "slate", icon: "GitBranch", order: 0 },
  staging: { value: "staging", label: "Staging", description: "Staging or preview deployment.", tone: "amber", icon: "Server", order: 1 },
  production: { value: "production", label: "Live", description: "Production URL.", tone: "green", icon: "Globe", order: 2 },
  design: { value: "design", label: "Design", description: "Design files.", tone: "violet", icon: "PenTool", order: 3 },
  doc: { value: "doc", label: "Docs", description: "Specs, runbooks and documents.", tone: "blue", icon: "FileText", order: 4 },
  drive: { value: "drive", label: "Drive", description: "Shared drive or client storage.", tone: "neutral", icon: "HardDrive", order: 5 },
  other: { value: "other", label: "Link", description: "Any other link.", tone: "neutral", icon: "Link", order: 6 },
};

export const LINK_TYPE_ORDER: LinkType[] = orderOf(LINK_TYPE_CONFIG);

/** Uploads (Vercel Blob, only when BLOB_READ_WRITE_TOKEN is set). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";
/** Blob pathnames must start with `${ATTACHMENT_PATH_PREFIX}${projectId}/`. */
export const ATTACHMENT_PATH_PREFIX = "attachments/";
export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "application/json",
  "text/plain",
  "application/zip",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "video/mp4",
] as const;

/* ================================================================== */
/*                                  Time                               */
/* ================================================================== */

export const TIME_ENTRY_SOURCE_CONFIG: Record<TimeEntrySource, { value: TimeEntrySource; label: string; icon: IconName }> = {
  manual: { value: "manual", label: "Manual", icon: "Pencil" },
  timer: { value: "timer", label: "Timer", icon: "Timer" },
  timesheet: { value: "timesheet", label: "Timesheet", icon: "Table" },
};

export const DEFAULT_WEEKLY_CAPACITY_HOURS = 40;
/** Working days per week used to spread estimates for workload. */
export const WORKING_DAYS_PER_WEEK = 5;
export const MAX_ENTRY_MINUTES = 1440;
/** Budget burn thresholds that colour bars and trigger notifications. */
export const BUDGET_THRESHOLDS = [75, 90, 100] as const;
/** Running hot = burn % exceeds elapsed % by more than this many points. */
export const RUNNING_HOT_MARGIN = 10;
/** Stopped timers older than this are pruned lazily (they only exist for Undo). */
export const STOPPED_TIMER_RETENTION_DAYS = 7;
/** Weeks shown by the workload heatmap. */
export const WORKLOAD_WEEKS = 6;

/* ================================================================== */
/*                       Scorecard and go-live                         */
/* ================================================================== */

export const METRIC_DIRECTION_CONFIG: Record<MetricDirection, OptionConfig<MetricDirection>> = {
  higher: { value: "higher", label: "Higher is better", description: "Met when current >= target.", tone: "green", icon: "TrendingUp", order: 0 },
  lower: { value: "lower", label: "Lower is better", description: "Met when current <= target.", tone: "blue", icon: "TrendingDown", order: 1 },
};

export interface MetricPresetMetric {
  name: string;
  /** "%" is display-only: the value is a fraction 0-1 shown x100 (formatMetricValue). */
  unit: string;
  direction: MetricDirection;
  /** Suggested target; agree the real one with the client. Rates are fractions (0.65 = 65%). */
  target: number;
}

export interface MetricPreset {
  key: string;
  label: string;
  /** Service lines that offer this preset first. */
  service_lines: ServiceLine[];
  metrics: MetricPresetMetric[];
}

/**
 * MetricDialog presets by kind of system. Eval-run metric names must equal
 * these scorecard names (trends and promote-to-champion match by name,
 * case-insensitively).
 */
export const METRIC_PRESETS: readonly MetricPreset[] = [
  {
    key: "rag",
    label: "RAG / retrieval",
    service_lines: ["ai_integration", "ai_agents"],
    metrics: [
      { name: "Faithfulness", unit: "", direction: "higher", target: 0.9 },
      { name: "Answer relevancy", unit: "", direction: "higher", target: 0.85 },
      { name: "Context precision", unit: "", direction: "higher", target: 0.8 },
      { name: "Context recall", unit: "", direction: "higher", target: 0.8 },
    ],
  },
  {
    key: "voice_agent",
    label: "Voice agent",
    service_lines: ["ai_agents"],
    metrics: [
      { name: "Containment rate", unit: "%", direction: "higher", target: 0.65 },
      { name: "Task completion", unit: "%", direction: "higher", target: 0.8 },
      { name: "Word error rate", unit: "%", direction: "lower", target: 0.12 },
      { name: "p95 turn latency", unit: "ms", direction: "lower", target: 1500 },
    ],
  },
  {
    key: "classifier",
    label: "Classifier",
    service_lines: ["ai_integration", "ai_automation"],
    metrics: [
      { name: "Precision", unit: "", direction: "higher", target: 0.9 },
      { name: "Recall", unit: "", direction: "higher", target: 0.85 },
      { name: "F1", unit: "", direction: "higher", target: 0.87 },
    ],
  },
  {
    key: "automation",
    label: "Automation",
    service_lines: ["ai_automation"],
    metrics: [
      { name: "First-response time", unit: "min", direction: "lower", target: 5 },
      { name: "Hours saved per week", unit: "h", direction: "higher", target: 20 },
      { name: "Error rate", unit: "%", direction: "lower", target: 0.02 },
    ],
  },
  {
    key: "data",
    label: "Data",
    service_lines: ["data"],
    metrics: [
      { name: "Gold-set accuracy", unit: "%", direction: "higher", target: 0.95 },
      { name: "Agreement (kappa)", unit: "", direction: "higher", target: 0.8 },
    ],
  },
];

/** Maximum metrics per scorecard (AvlysAI agrees 1-3; a few more are allowed). */
export const MAX_SUCCESS_METRICS = 6;
export const DEFAULT_TUNING_DAYS = 90;
/** Days before the tuning window ends when owners are notified and "Propose retainer" appears. */
export const TUNING_ALERT_DAYS = 14;
/** Home "Tuning windows" tile shows windows ending within this many days. */
export const TUNING_ENDING_WINDOW_DAYS = 21;
/** phase_key of the post-go-live phase whose deliverables form the handover checklist. */
export const HANDOVER_PHASE_KEY = "scale";
/** Home "Upcoming milestones" horizon. */
export const MILESTONE_DUE_WINDOW_DAYS = 14;

/* ================================================================== */
/*                         Status updates and RAID                     */
/* ================================================================== */

export const STATUS_HEADLINE_MAX = 140;
export const DEFAULT_UPDATE_CADENCE_DAYS = 7;

export const RISK_KIND_CONFIG: Record<RiskKind, OptionConfig<RiskKind> & { plural: string }> = {
  risk: { value: "risk", label: "Risk", plural: "Risks", description: "Something that may happen.", tone: "orange", icon: "ShieldAlert", order: 0 },
  assumption: { value: "assumption", label: "Assumption", plural: "Assumptions", description: "Believed true; confirm by a date.", tone: "slate", icon: "CircleHelp", order: 1 },
  issue: { value: "issue", label: "Issue", plural: "Issues", description: "A risk that has happened.", tone: "red", icon: "TriangleAlert", order: 2 },
  dependency: { value: "dependency", label: "Dependency", plural: "Dependencies", description: "Needed from the client or a third party.", tone: "blue", icon: "Waypoints", order: 3 },
  decision: { value: "decision", label: "Decision", plural: "Decisions", description: "A recorded decision and its rationale.", tone: "violet", icon: "Gavel", order: 4 },
};

export const RISK_KIND_ORDER: RiskKind[] = orderOf(RISK_KIND_CONFIG);

export const RISK_CATEGORY_CONFIG: Record<RiskCategory, OptionConfig<RiskCategory>> = {
  data_access: { value: "data_access", label: "Data access", description: "Client data not yet available.", tone: "orange", icon: "KeyRound", order: 0 },
  data_quality: { value: "data_quality", label: "Data quality", description: "Noisy, biased or incomplete data.", tone: "orange", icon: "Database", order: 1 },
  model_performance: { value: "model_performance", label: "Model performance", description: "Accuracy below target.", tone: "violet", icon: "Gauge", order: 2 },
  hallucination_grounding: { value: "hallucination_grounding", label: "Hallucination / grounding", description: "Ungrounded or invented answers.", tone: "violet", icon: "Sparkles", order: 3 },
  privacy_pii: { value: "privacy_pii", label: "Privacy / PII", description: "Personal data handling.", tone: "red", icon: "UserLock", order: 4 },
  security: { value: "security", label: "Security", description: "Prompt injection, tool abuse, access.", tone: "red", icon: "ShieldCheck", order: 5 },
  compliance: { value: "compliance", label: "Compliance", description: "HIPAA, DPDP, GDPR, data residency.", tone: "red", icon: "Scale", order: 6 },
  bias_fairness: { value: "bias_fairness", label: "Bias / fairness", description: "Unfair outcomes for groups of users.", tone: "amber", icon: "Scale", order: 7 },
  integration: { value: "integration", label: "Integration", description: "APIs, limits and legacy systems.", tone: "blue", icon: "Network", order: 8 },
  vendor_model_churn: { value: "vendor_model_churn", label: "Vendor / model churn", description: "Model deprecation or pricing changes.", tone: "slate", icon: "Shuffle", order: 9 },
  scope: { value: "scope", label: "Scope", description: "Scope creep or unclear requirements.", tone: "amber", icon: "Maximize2", order: 10 },
  client_dependency: { value: "client_dependency", label: "Client dependency", description: "Waiting on the client.", tone: "blue", icon: "Handshake", order: 11 },
  schedule: { value: "schedule", label: "Schedule", description: "Dates at risk.", tone: "amber", icon: "CalendarX", order: 12 },
  budget: { value: "budget", label: "Budget", description: "Hours or cost over plan.", tone: "amber", icon: "Wallet", order: 13 },
  other: { value: "other", label: "Other", description: "Anything else.", tone: "neutral", icon: "Ellipsis", order: 14 },
};

export const RISK_CATEGORY_ORDER: RiskCategory[] = orderOf(RISK_CATEGORY_CONFIG);

export const RISK_STATUS_CONFIG: Record<RiskStatus, DotOptionConfig<RiskStatus>> = {
  open: { value: "open", label: "Open", description: "Needs attention.", tone: "orange", icon: "CircleDot", dotClass: "bg-orange-500", order: 0 },
  mitigating: { value: "mitigating", label: "Mitigating", description: "Mitigation in progress.", tone: "blue", icon: "Wrench", dotClass: "bg-blue-500", order: 1 },
  accepted: { value: "accepted", label: "Accepted", description: "Accepted without further action.", tone: "slate", icon: "Handshake", dotClass: "bg-slate-400", order: 2 },
  closed: { value: "closed", label: "Closed", description: "No longer relevant.", tone: "green", icon: "CircleCheck", dotClass: "bg-emerald-500", order: 3 },
};

export const OPEN_RISK_STATUSES: RiskStatus[] = ["open", "mitigating"];
/** Score = likelihood x impact (1-25). >= RED is red, >= AMBER is amber, below is green. */
export const RISK_SCORE_RED = 15;
export const RISK_SCORE_AMBER = 8;
export const RISK_SCALE = [1, 2, 3, 4, 5] as const;
export const RISK_LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"] as const;
export const RISK_IMPACT_LABELS = ["Minimal", "Minor", "Moderate", "Major", "Severe"] as const;

/* ================================================================== */
/*                          Evals and data batches                     */
/* ================================================================== */

export const EVAL_CHANGE_TYPE_CONFIG: Record<EvalChangeType, OptionConfig<EvalChangeType>> = {
  prompt: { value: "prompt", label: "Prompt", description: "Prompt or instruction change.", tone: "blue", icon: "MessageSquareText", order: 0 },
  model: { value: "model", label: "Model", description: "Model or provider change.", tone: "violet", icon: "Cpu", order: 1 },
  retrieval: { value: "retrieval", label: "Retrieval", description: "Chunking, embeddings, reranking.", tone: "green", icon: "Search", order: 2 },
  data: { value: "data", label: "Data", description: "Knowledge or training data change.", tone: "orange", icon: "Database", order: 3 },
  finetune: { value: "finetune", label: "Fine-tune", description: "Fine-tuned weights.", tone: "amber", icon: "SlidersHorizontal", order: 4 },
  code: { value: "code", label: "Code", description: "Tooling, orchestration or app code.", tone: "slate", icon: "Code", order: 5 },
  other: { value: "other", label: "Other", description: "Anything else.", tone: "neutral", icon: "Ellipsis", order: 6 },
};

export const EVAL_VERDICT_CONFIG: Record<EvalVerdict, OptionConfig<EvalVerdict>> = {
  baseline: { value: "baseline", label: "Baseline", description: "Reference point before changes.", tone: "slate", icon: "Anchor", order: 0 },
  candidate: { value: "candidate", label: "Candidate", description: "Under evaluation.", tone: "blue", icon: "FlaskConical", order: 1 },
  champion: { value: "champion", label: "Champion", description: "Current best run.", tone: "green", icon: "Star", order: 2 },
  rejected: { value: "rejected", label: "Rejected", description: "Not adopted.", tone: "red", icon: "CircleX", order: 3 },
  archived: { value: "archived", label: "Archived", description: "Former champion.", tone: "neutral", icon: "Archive", order: 4 },
};

export const BATCH_UNIT_TYPE_CONFIG: Record<
  BatchUnitType,
  { value: BatchUnitType; label: string; singular: string; plural: string; icon: IconName; order: number }
> = {
  records: { value: "records", label: "Records", singular: "record", plural: "records", icon: "Table", order: 0 },
  documents: { value: "documents", label: "Documents", singular: "document", plural: "documents", icon: "FileText", order: 1 },
  images: { value: "images", label: "Images", singular: "image", plural: "images", icon: "Image", order: 2 },
  audio_hours: { value: "audio_hours", label: "Audio hours", singular: "audio hour", plural: "audio hours", icon: "AudioLines", order: 3 },
  video_episodes: { value: "video_episodes", label: "Video episodes", singular: "video episode", plural: "video episodes", icon: "Video", order: 4 },
  other: { value: "other", label: "Other units", singular: "unit", plural: "units", icon: "Boxes", order: 5 },
};

export const AGREEMENT_METRIC_CONFIG: Record<AgreementMetric, { value: AgreementMetric; label: string; shortLabel: string }> = {
  kappa: { value: "kappa", label: "Cohen's kappa", shortLabel: "κ" },
  alpha: { value: "alpha", label: "Krippendorff's alpha", shortLabel: "α" },
  percent: { value: "percent", label: "Percent agreement", shortLabel: "%" },
};

export const BATCH_STATUS_CONFIG: Record<BatchStatus, DotOptionConfig<BatchStatus>> = {
  planned: { value: "planned", label: "Planned", description: "Not started.", tone: "slate", icon: "CircleDashed", dotClass: "bg-slate-400", order: 0 },
  in_production: { value: "in_production", label: "In production", description: "Being collected or labelled.", tone: "blue", icon: "CircleDot", dotClass: "bg-blue-500", order: 1 },
  in_review: { value: "in_review", label: "In review", description: "Gold-set audit in progress.", tone: "violet", icon: "Eye", dotClass: "bg-violet-500", order: 2 },
  accepted: { value: "accepted", label: "Accepted", description: "Accepted by the client.", tone: "green", icon: "CircleCheck", dotClass: "bg-emerald-500", order: 3 },
  rejected: { value: "rejected", label: "Rejected", description: "Failed acceptance.", tone: "red", icon: "CircleX", dotClass: "bg-rose-500", order: 4 },
  rework: { value: "rework", label: "Rework", description: "Being corrected after review.", tone: "amber", icon: "RotateCcw", dotClass: "bg-amber-500", order: 5 },
};

export const BATCH_STATUS_ORDER: BatchStatus[] = orderOf(BATCH_STATUS_CONFIG);

/* ================================================================== */
/*                       Saved views and project tabs                  */
/* ================================================================== */

export const SAVED_VIEW_SCOPE_CONFIG: Record<SavedViewScope, { value: SavedViewScope; label: string; href: string; icon: IconName }> = {
  projects: { value: "projects", label: "Projects", href: "/projects", icon: "FolderKanban" },
  tasks: { value: "tasks", label: "Tasks", href: "/tasks", icon: "ListChecks" },
  calendar: { value: "calendar", label: "Calendar", href: "/calendar", icon: "CalendarDays" },
  timeline: { value: "timeline", label: "Timeline", href: "/timeline", icon: "ChartGantt" },
  reports: { value: "reports", label: "Reports", href: "/reports", icon: "ChartColumn" },
};

/** Serialized filters JSON must stay under this many characters. */
export const MAX_SAVED_VIEW_FILTERS_LENGTH = 1000;

/** Labels/icons/order of the project detail tabs. Components live in the tab registry. */
export const PROJECT_TAB_CONFIG: Record<ProjectTabId, { id: ProjectTabId; label: string; icon: IconName; order: number }> = {
  overview: { id: "overview", label: "Overview", icon: "LayoutGrid", order: 0 },
  tasks: { id: "tasks", label: "Tasks", icon: "SquareKanban", order: 10 },
  timeline: { id: "timeline", label: "Timeline", icon: "ChartGantt", order: 20 },
  updates: { id: "updates", label: "Updates", icon: "Megaphone", order: 30 },
  risks: { id: "risks", label: "Risks", icon: "ShieldAlert", order: 40 },
  evals: { id: "evals", label: "Evals", icon: "FlaskConical", order: 50 },
  batches: { id: "batches", label: "Batches", icon: "Database", order: 60 },
  time: { id: "time", label: "Time", icon: "Timer", order: 70 },
  files: { id: "files", label: "Files", icon: "Paperclip", order: 80 },
  activity: { id: "activity", label: "Activity", icon: "Activity", order: 90 },
};

/* ================================================================== */
/*                               Navigation                            */
/* ================================================================== */

export type NavGroupId = "workspace" | "delivery" | "insights" | "admin";

export interface NavGroup {
  id: NavGroupId;
  label: string;
  order: number;
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { id: "workspace", label: "Workspace", order: 0 },
  { id: "delivery", label: "Delivery", order: 1 },
  { id: "insights", label: "Insights", order: 2 },
  { id: "admin", label: "Admin", order: 3 },
];

export interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: IconName;
  group: NavGroupId;
  /** Order inside its group. */
  order: number;
  /**
   * false until the page exists. The integration agent of the workflow that
   * builds the page flips it to true (one-line change). Disabled items are
   * never rendered and their shortcuts are inactive.
   */
  enabled: boolean;
  /** Two-key "g x" sequence, see SHORTCUTS. */
  shortcut?: string;
  adminOnly?: boolean;
}

export const NAV_CONFIG: readonly NavItem[] = [
  { id: "home", href: "/dashboard", label: "Home", icon: "House", group: "workspace", order: 0, enabled: true, shortcut: "g h" },
  { id: "my_tasks", href: "/tasks", label: "My tasks", icon: "ListChecks", group: "workspace", order: 1, enabled: true, shortcut: "g t" },
  { id: "inbox", href: "/inbox", label: "Inbox", icon: "Inbox", group: "workspace", order: 2, enabled: true, shortcut: "g i" },
  { id: "projects", href: "/projects", label: "Projects", icon: "FolderKanban", group: "delivery", order: 0, enabled: true, shortcut: "g p" },
  { id: "clients", href: "/clients", label: "Clients", icon: "Building2", group: "delivery", order: 1, enabled: true, shortcut: "g c" },
  { id: "calendar", href: "/calendar", label: "Calendar", icon: "CalendarDays", group: "delivery", order: 2, enabled: true, shortcut: "g k" },
  { id: "timeline", href: "/timeline", label: "Timeline", icon: "ChartGantt", group: "delivery", order: 3, enabled: true, shortcut: "g l" },
  { id: "time", href: "/time", label: "Time", icon: "Clock", group: "insights", order: 0, enabled: true, shortcut: "g s" },
  { id: "reports", href: "/reports", label: "Reports", icon: "ChartColumn", group: "insights", order: 1, enabled: true, shortcut: "g r" },
  { id: "team", href: "/team", label: "Team", icon: "Users", group: "admin", order: 0, enabled: true },
  { id: "settings", href: "/settings", label: "Settings", icon: "Settings", group: "admin", order: 1, enabled: true },
];

/** Enabled nav items grouped and ordered, ready for the sidebar. */
export function navSections(isAdmin: boolean): { group: NavGroup; items: NavItem[] }[] {
  return [...NAV_GROUPS]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      group,
      items: NAV_CONFIG.filter(
        (item) => item.group === group.id && item.enabled && (!item.adminOnly || isAdmin),
      ).sort((a, b) => a.order - b.order),
    }))
    .filter((section) => section.items.length > 0);
}

/* ================================================================== */
/*                      Keyboard, storage and motion                   */
/* ================================================================== */

export type ShortcutGroup = "General" | "Navigation" | "Lists and boards" | "Inbox";

export interface ShortcutDef {
  id: string;
  /** Space-separated sequence; "mod" = Cmd on macOS, Ctrl elsewhere. */
  keys: string;
  label: string;
  group: ShortcutGroup;
}

/** The help overlay (?) lists these; navigation entries come from NAV_CONFIG shortcuts. */
export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: "palette", keys: "mod+k", label: "Open command menu", group: "General" },
  { id: "search", keys: "/", label: "Search", group: "General" },
  { id: "new_task", keys: "c", label: "New task (in this project when on a project page)", group: "General" },
  { id: "new_project", keys: "shift+c", label: "New project", group: "General" },
  { id: "timer", keys: "t", label: "Start or stop timer", group: "General" },
  { id: "help", keys: "?", label: "Show keyboard shortcuts", group: "General" },
  { id: "list_next", keys: "j", label: "Next item", group: "Lists and boards" },
  { id: "list_prev", keys: "k", label: "Previous item", group: "Lists and boards" },
  { id: "list_select", keys: "x", label: "Select item", group: "Lists and boards" },
  { id: "list_open", keys: "enter", label: "Open item", group: "Lists and boards" },
  { id: "list_status", keys: "s", label: "Change status", group: "Lists and boards" },
  { id: "list_assign_me", keys: "a", label: "Assign to me", group: "Lists and boards" },
  { id: "inbox_read", keys: "e", label: "Mark as read", group: "Inbox" },
];

/** Milliseconds allowed between the two keys of a "g x" sequence. */
export const SHORTCUT_SEQUENCE_MS = 800;

/** window CustomEvent name carrying an AppCommand in `detail`. */
export const APP_COMMAND_EVENT = "prx:command";

/** localStorage keys (per-viewer conveniences only; always wrap access in try/catch). */
export const STORAGE_KEYS = {
  theme: "prx-theme",
  motion: "prx-motion",
  transparency: "prx-transparency",
  recent: "prx-recent",
} as const;

export const MOTION_PREFERENCES = ["system", "reduce", "full"] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];
export const TRANSPARENCY_PREFERENCES = ["system", "reduce"] as const;
export type TransparencyPreference = (typeof TRANSPARENCY_PREFERENCES)[number];

/** Command palette recent items kept in localStorage. */
export const RECENT_ITEMS_MAX = 8;
export const SEARCH_QUERY_MAX = 100;
export const SEARCH_RESULTS_PER_GROUP = 5;

/**
 * Motion tokens from the Aurora Grid direction (seconds / cubic-bezier).
 * Mirrors the CSS tokens in globals.css; the design agent owns final values.
 */
export const MOTION = {
  duration: { press: 0.1, hover: 0.15, popover: 0.2, dialog: 0.28, pageEnter: 0.22 },
  exitFactor: 0.7,
  ease: {
    outExpo: [0.16, 1, 0.3, 1],
    outQuart: [0.25, 1, 0.5, 1],
    inExit: [0.4, 0, 1, 1],
    drawer: [0.32, 0.72, 0, 1],
  },
  spring: { type: "spring", visualDuration: 0.3, bounce: 0.15 },
  /** Use for anything that shows data. */
  springNoBounce: { type: "spring", visualDuration: 0.3, bounce: 0 },
  stagger: { step: 0.035, maxItems: 8 },
} as const;

/* ================================================================== */
/*                            Workspace defaults                       */
/* ================================================================== */

export const DEFAULT_WORKSPACE_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_USD_INR_RATE = 83;

/* ================================================================== */
/*                     Numeric bounds (mirror db.ts)                   */
/* ================================================================== */
/*
 * Every INTEGER column tops out at MAX_DB_INT; writing more fails with 22003
 * (a generic error), so zod schemas cap every integer input:
 * z.number().int().min(0).max(MAX_DB_INT) or a lower business cap below.
 */

/** Postgres INTEGER maximum. */
export const MAX_DB_INT = 2_147_483_647;
/** Money columns (contract_value, hourly_rate, price, cost_rate) are INTEGER whole units. */
export const MAX_MONEY = MAX_DB_INT;
/** projects.tuning_days and app_settings.default_tuning_days CHECK 0..730. */
export const MAX_TUNING_DAYS = 730;
/** users.weekly_capacity_hours CHECK 0..168. */
export const MAX_WEEKLY_CAPACITY_HOURS = 168;
/** app_settings.update_cadence_days CHECK 1..60. */
export const MIN_UPDATE_CADENCE_DAYS = 1;
export const MAX_UPDATE_CADENCE_DAYS = 60;
