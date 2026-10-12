/**
 * Built-in AvlysAI engagement templates (pure data + schedule helpers).
 *
 * The phases, deliverables and durations come from AvlysAI's own service
 * pages (see the product plan). They are starting points: applying a template
 * creates ordinary milestones, tasks, success metrics and risks that the team
 * edits freely, and any project can be saved as a custom template
 * (project_templates). Applying happens inside the createProject transaction
 * (owned by the templates agent, SPEC.md section 17).
 *
 * Offsets: milestone.offset_days is relative to the project start date;
 * task.offset_days is relative to its milestone's start. A phase covering
 * `duration_days` days ends on start + duration - 1; point milestones
 * (duration 0) fall on their start day. Phase offsets are multiples of 7
 * where the work is weekly, so phases start on the project's start weekday.
 *
 * Rates (success rates, accuracy, error rates) are fractions 0-1; unit "%"
 * is display-only (formatMetricValue in utils.ts).
 *
 * The handover checklist is the set of deliverable tasks in the "scale"
 * phase (HANDOVER_PHASE_KEY), one deliverable per handover item, so
 * GoLiveSummary.handover_total/done and closeTuning's guard count items.
 *
 * Template keys stored in projects.template_key are "builtin:<key>" or
 * "custom:<uuid>" (see templateKeyFor / parseTemplateKey).
 */
import type { IconName } from "./constants";
import { addDaysISO, diffDaysISO } from "./workspace-time";
import type {
  MilestoneKind,
  ProjectTemplate,
  ServiceLine,
  TemplateMilestone,
  TemplatePayload,
  TemplateTask,
} from "./types";

export const BUILTIN_TEMPLATE_KEYS = [
  "ai_delivery",
  "ai_readiness",
  "avlys_data",
  "retainer",
  "custom_software",
] as const;
export type BuiltinTemplateKey = (typeof BUILTIN_TEMPLATE_KEYS)[number];

export interface TemplateDefinition {
  key: BuiltinTemplateKey;
  name: string;
  description: string;
  icon: IconName;
  /** Service lines this template is offered for (first = default suggestion). */
  service_lines: ServiceLine[];
  payload: TemplatePayload;
}

/** Built-in and custom templates in one shape, for the "Start from" picker. */
export interface TemplateOption {
  /** Value for projects.template_key: "builtin:<key>" or "custom:<uuid>". */
  key: string;
  source: "builtin" | "custom";
  /** Built-in key or custom template id. */
  id: string;
  name: string;
  description: string;
  icon: IconName;
  service_lines: ServiceLine[];
  payload: TemplatePayload;
  /** Build days (excludes the tuning window). */
  build_days: number;
  tuning_days: number;
  /** e.g. "~9 weeks + 90-day tuning". */
  duration_label: string;
}

/* --------------------------- Small builders ------------------------- */

function task(
  title: string,
  offset_days: number,
  duration_days: number,
  estimate_minutes: number | null,
  extra: Partial<Pick<TemplateTask, "is_deliverable" | "checklist" | "description">> = {},
): TemplateTask {
  return {
    title,
    offset_days,
    duration_days,
    estimate_minutes,
    is_deliverable: extra.is_deliverable ?? false,
    checklist: extra.checklist ?? [],
    ...(extra.description ? { description: extra.description } : {}),
  };
}

function deliverable(
  title: string,
  offset_days: number,
  duration_days: number,
  estimate_minutes: number | null,
  checklist: string[] = [],
): TemplateTask {
  return task(title, offset_days, duration_days, estimate_minutes, { is_deliverable: true, checklist });
}

/** Usage reviews on days 30, 60 and 90 of the 90-day tuning phase (offset = day - 1). */
function usageReviews(): TemplateTask[] {
  return [
    task("Usage review: day 30", 29, 1, 120),
    task("Usage review: day 60", 59, 1, 120),
    task("Usage review: day 90", 89, 1, 120),
  ];
}

/**
 * Handover items of an AI build, one deliverable each, inside the last ten
 * days of the 90-day phase (every item ends by day 90, offset 89).
 */
function aiHandoverDeliverables(): TemplateTask[] {
  return [
    deliverable("Handover: repository transferred", 80, 9, 60),
    deliverable("Handover: cloud accounts transferred", 80, 9, 120),
    deliverable("Handover: runbook delivered", 82, 7, 60),
    deliverable("Handover: client operators trained", 84, 5, 120),
    deliverable("Handover: credentials rotated", 86, 3, 60),
    deliverable("Handover: Avlys access revoked", 88, 2, 30),
  ];
}

/** Handover items of a custom software build (full IP transfer), one deliverable each. */
function softwareHandoverDeliverables(): TemplateTask[] {
  return [
    deliverable("Handover: repository transferred", 80, 9, 60),
    deliverable("Handover: cloud accounts transferred", 80, 9, 120),
    deliverable("Handover: designs and assets transferred", 80, 9, 60),
    deliverable("Handover: runbook delivered", 82, 7, 60),
    deliverable("Handover: credentials rotated", 86, 3, 60),
    deliverable("Handover: Avlys access revoked", 88, 2, 30),
  ];
}

/* ----------------------------- Templates ---------------------------- */

const AI_DELIVERY: TemplateDefinition = {
  key: "ai_delivery",
  name: "AI delivery",
  description:
    "Audit, a 5-week fixed-price Pilot, Integrate, go-live and 90 days of tuning before handover. AvlysAI's standard lifecycle for AI integration, agents and automation.",
  icon: "Rocket",
  service_lines: ["ai_agents", "ai_integration", "ai_automation"],
  payload: {
    progress_mode: "tasks",
    engagement_type: "fixed_price",
    service_line: null,
    delivery_state: "not_started",
    budget_period: "total",
    tuning_days: 90,
    milestones: [
      {
        key: "audit",
        name: "Audit",
        kind: "phase",
        offset_days: 0,
        duration_days: 7,
        requires_gate: true,
        description:
          "Map systems, data sources and the target workflow. Agree one success metric with the client in week one.",
        tasks: [
          task("Kick-off and stakeholder map", 0, 1, 120),
          task("Agree the success metric, baseline and target", 0, 3, 120),
          deliverable("System map", 1, 4, 480),
          deliverable("Data readiness review", 1, 5, 600),
          deliverable("Success criteria document", 3, 4, 240),
        ],
      },
      {
        key: "pilot",
        name: "Pilot",
        kind: "phase",
        offset_days: 7,
        duration_days: 35,
        requires_gate: true,
        description: "Fixed-scope, fixed-price build of the core loop, tested on real cases.",
        tasks: [
          task("Build the evaluation set (golden set)", 0, 7, 720),
          task("Build the core loop", 0, 28, 4800),
          task("Weekly pilot demo", 6, 28, 240),
          deliverable("Working pilot", 0, 33, null),
          deliverable("Evaluation results", 28, 6, 480),
          deliverable("Pilot-to-production plan", 30, 5, 360),
        ],
      },
      {
        key: "integrate",
        name: "Integrate",
        kind: "phase",
        offset_days: 42,
        duration_days: 21,
        requires_gate: true,
        description:
          "Connect to CRM/ERP, databases, telephony and internal tools with access controls, logging and human-review checkpoints.",
        tasks: [
          task("Human-review checkpoints", 5, 10, 480),
          deliverable("Production integrations", 0, 18, 2400),
          deliverable("Access and audit controls", 5, 12, 720),
          deliverable("Runbook", 14, 7, 360),
        ],
      },
      {
        key: "go_live",
        name: "Go-live",
        kind: "milestone",
        offset_days: 63,
        duration_days: 0,
        requires_gate: false,
        description: "Production launch. Set the project's go-live date to start the tuning countdown.",
        tasks: [],
      },
      {
        key: "scale",
        name: "Scale and tuning",
        kind: "phase",
        offset_days: 63,
        duration_days: 90,
        requires_gate: false,
        is_tuning: true,
        description: "90 days of post-deploy tuning: usage reviews, edge-case fixes, documentation and handover.",
        tasks: [
          ...usageReviews(),
          task("Edge-case fix log", 0, 90, null),
          deliverable("Documentation", 60, 25, 600),
          deliverable("Handover training", 75, 10, 240),
          ...aiHandoverDeliverables(),
        ],
      },
    ],
    metrics: [
      { name: "Task success rate", unit: "%", direction: "higher", baseline: null, target: 0.8 },
      { name: "p95 latency", unit: "ms", direction: "lower", baseline: null, target: 2000 },
    ],
    risks: [
      {
        kind: "dependency",
        category: "data_access",
        title: "Client data access delayed",
        likelihood: 3,
        impact: 4,
        mitigation: "Agree a data access date during the Audit. Escalate after 3 working days.",
      },
      {
        kind: "risk",
        category: "integration",
        title: "Integration API rate limits",
        likelihood: 3,
        impact: 3,
        mitigation: "Confirm limits and sandbox access during the Audit.",
      },
      {
        kind: "risk",
        category: "model_performance",
        title: "Accuracy below target on real cases",
        likelihood: 3,
        impact: 4,
        mitigation: "Build the golden set early and review eval results every week.",
      },
      {
        kind: "risk",
        category: "privacy_pii",
        title: "PII handling in prompts and logs",
        likelihood: 2,
        impact: 5,
        mitigation: "Redact PII before logging. Keep data in the client's cloud where possible.",
      },
    ],
    label_names: [],
  },
};

const AI_READINESS: TemplateDefinition = {
  key: "ai_readiness",
  name: "AI readiness assessment",
  description:
    "Discover, Evaluate and Plan in about three weeks. Ends in a pilot specification and a costed roadmap that can be converted into a pilot.",
  icon: "Lightbulb",
  service_lines: ["consulting"],
  payload: {
    progress_mode: "tasks",
    engagement_type: "fixed_price",
    service_line: "consulting",
    delivery_state: "not_started",
    budget_period: "total",
    tuning_days: 0,
    milestones: [
      {
        key: "discover",
        name: "Discover",
        kind: "phase",
        offset_days: 0,
        duration_days: 5,
        requires_gate: false,
        description: "Operator interviews and a review of systems and data.",
        tasks: [
          task("Operator interviews", 0, 3, 600),
          task("Systems and data review", 1, 4, 480),
          deliverable("Workflow inventory and data readiness review", 2, 3, 360),
        ],
      },
      {
        key: "evaluate",
        name: "Evaluate",
        kind: "phase",
        offset_days: 7,
        duration_days: 5,
        requires_gate: false,
        description: "Score use cases on impact, feasibility and cost, with build-vs-buy for each.",
        tasks: [deliverable("Ranked use-case matrix", 0, 4, 480), deliverable("Build-vs-buy analysis", 1, 4, 360)],
      },
      {
        key: "plan",
        name: "Plan",
        kind: "phase",
        offset_days: 14,
        duration_days: 5,
        requires_gate: false,
        description:
          "Turn the best use case into a pilot specification: scope, architecture, integration points, success metric and a fixed price.",
        tasks: [
          deliverable("Pilot specification", 0, 4, 480),
          deliverable("Costed roadmap", 1, 4, 360),
          deliverable("Executive summary", 3, 2, 180),
          task("Readout session with the client", 4, 1, 120),
        ],
      },
    ],
    metrics: [],
    risks: [
      {
        kind: "dependency",
        category: "client_dependency",
        title: "Stakeholders unavailable for interviews",
        likelihood: 3,
        impact: 3,
        mitigation: "Book interview slots at kick-off.",
      },
      {
        kind: "dependency",
        category: "data_access",
        title: "Access to systems and sample data for the review",
        likelihood: 3,
        impact: 3,
        mitigation: "Request read-only access and sample exports before Discover starts.",
      },
    ],
    label_names: [],
  },
};

const AVLYS_DATA: TemplateDefinition = {
  key: "avlys_data",
  name: "Avlys Data",
  description:
    "Scope, a paid calibration batch, production in accepted batches, a gold-set audit and delivery. Progress comes from accepted units.",
  icon: "Database",
  service_lines: ["data"],
  payload: {
    progress_mode: "batches",
    engagement_type: "fixed_price",
    service_line: "data",
    delivery_state: "not_started",
    budget_period: "total",
    tuning_days: 0,
    milestones: [
      {
        key: "scope",
        name: "Scope",
        kind: "phase",
        offset_days: 0,
        duration_days: 5,
        requires_gate: false,
        description: "Taxonomy, edge cases and the bar that counts as done.",
        tasks: [
          task("Taxonomy and edge cases", 0, 4, 360),
          task("Acceptance criteria and quality thresholds", 1, 3, 240),
          task("Unit definition and minimum batch size", 2, 2, 120),
        ],
      },
      {
        key: "calibrate",
        name: "Calibrate",
        kind: "phase",
        offset_days: 7,
        duration_days: 12,
        requires_gate: true,
        description:
          "A small paid batch, reviewed and corrected. Freeze the guideline version before volume production starts.",
        tasks: [
          task("Calibration batch", 0, 7, 1200),
          task("Review and correct the calibration batch", 6, 3, 480),
          task("Freeze the guideline version", 9, 1, 60),
        ],
      },
      {
        key: "produce",
        name: "Produce",
        kind: "phase",
        offset_days: 21,
        duration_days: 35,
        requires_gate: false,
        description: "Collection, cleaning and labelling in accepted batches, with automated checks.",
        tasks: [
          task("Production batches", 0, 35, null),
          task("Automated checks", 0, 5, 600),
          task("Weekly progress report", 6, 28, 120),
        ],
      },
      {
        key: "audit",
        name: "Audit",
        kind: "phase",
        offset_days: 56,
        duration_days: 7,
        requires_gate: true,
        description: "Independent second pass scored against a held-out gold set.",
        tasks: [
          deliverable("Gold-set audit results", 0, 6, 720),
          deliverable("Agreement scores", 0, 6, 240),
          deliverable("Correction log", 2, 5, 240),
        ],
      },
      {
        key: "deliver",
        name: "Deliver",
        kind: "phase",
        offset_days: 63,
        duration_days: 5,
        requires_gate: false,
        description: "The final dataset with its schema, guidelines and handover documents.",
        tasks: [
          deliverable("Final dataset", 0, 4, 360),
          deliverable("Check log", 0, 3, 180),
          deliverable("Schema and data dictionary", 0, 3, 240),
          deliverable("Guidelines and known limitations", 1, 3, 240),
        ],
      },
    ],
    metrics: [
      { name: "Gold-set accuracy", unit: "%", direction: "higher", baseline: null, target: 0.95 },
      { name: "Agreement (kappa)", unit: "", direction: "higher", baseline: null, target: 0.8 },
    ],
    risks: [
      {
        kind: "risk",
        category: "scope",
        title: "Guideline changes after calibration",
        likelihood: 3,
        impact: 4,
        mitigation: "Changes after calibration need written approval with their cost and date impact.",
      },
      {
        kind: "dependency",
        category: "data_access",
        title: "Source data access delayed",
        likelihood: 3,
        impact: 3,
        mitigation: "Agree the delivery format and access date during Scope.",
      },
      {
        kind: "risk",
        category: "privacy_pii",
        title: "PII in source data",
        likelihood: 2,
        impact: 5,
        mitigation: "Agree redaction rules in Scope and spot-check every batch.",
      },
      {
        kind: "risk",
        category: "data_quality",
        title: "Annotator agreement below threshold",
        likelihood: 3,
        impact: 3,
        mitigation: "Re-train on disagreements found in calibration; review agreement per batch.",
      },
    ],
    label_names: [],
  },
};

function monthlyReview(month: number): TemplateMilestone {
  return {
    key: `month_${month}`,
    name: `Month ${month} review`,
    kind: "milestone",
    offset_days: month * 30,
    duration_days: 0,
    requires_gate: false,
    description: "Usage, health, hours against budget and next month's priorities.",
    tasks: [deliverable("Monthly report", 0, 1, 180), task("Review call with the client", 0, 1, 60)],
  };
}

const RETAINER: TemplateDefinition = {
  key: "retainer",
  name: "Retainer",
  description:
    "Ongoing updates, monitoring, fixes and feature iterations against a monthly hours budget, with a review every month.",
  icon: "Repeat",
  service_lines: ["ai_agents", "ai_integration", "ai_automation", "custom_software", "data"],
  payload: {
    progress_mode: "manual",
    engagement_type: "retainer",
    service_line: null,
    delivery_state: "production",
    budget_period: "monthly",
    tuning_days: 0,
    milestones: [monthlyReview(1), monthlyReview(2), monthlyReview(3)],
    metrics: [],
    risks: [
      {
        kind: "risk",
        category: "scope",
        title: "Requests beyond the monthly hours budget",
        likelihood: 3,
        impact: 3,
        mitigation: "Track burn weekly and agree priorities in the monthly review.",
      },
      {
        kind: "dependency",
        category: "client_dependency",
        title: "Client feedback turnaround",
        likelihood: 2,
        impact: 3,
        mitigation: "Agree a named client contact and a response time.",
      },
    ],
    label_names: [],
  },
};

const CUSTOM_SOFTWARE: TemplateDefinition = {
  key: "custom_software",
  name: "Custom software build",
  description:
    "Audit and architecture, a prototype or MVP, the build, go-live and 90 days of support before full IP transfer.",
  icon: "Code",
  service_lines: ["custom_software"],
  payload: {
    progress_mode: "tasks",
    engagement_type: "fixed_price",
    service_line: "custom_software",
    delivery_state: "not_started",
    budget_period: "total",
    tuning_days: 90,
    milestones: [
      {
        key: "audit",
        name: "Audit and architecture",
        kind: "phase",
        offset_days: 0,
        duration_days: 10,
        requires_gate: true,
        description: "Requirements, system map and architecture. Agree acceptance criteria.",
        tasks: [
          task("Requirements workshop", 0, 2, 360),
          deliverable("System map and architecture", 1, 7, 720),
          deliverable("Technical specification", 3, 6, 720),
          deliverable("Acceptance criteria", 6, 4, 240),
        ],
      },
      {
        key: "prototype",
        name: "Prototype / MVP",
        kind: "phase",
        offset_days: 10,
        duration_days: 28,
        requires_gate: true,
        description: "A clickable prototype or MVP of the core flows, reviewed with the client.",
        tasks: [
          task("Design system and key screens", 0, 10, 1440),
          deliverable("MVP of the core flows", 5, 21, 4800),
          deliverable("Client review and UAT round 1", 24, 4, 360),
        ],
      },
      {
        key: "build",
        name: "Build",
        kind: "phase",
        offset_days: 38,
        duration_days: 42,
        requires_gate: true,
        description: "Production features, integrations, tests and infrastructure in the client's accounts.",
        tasks: [
          deliverable("Production features", 0, 35, 9600),
          deliverable("Integrations", 7, 28, 2400),
          task("Automated test suite", 0, 40, 1440),
          task("Infrastructure in the client's cloud", 10, 15, 960),
          deliverable("UAT sign-off", 35, 7, 480),
        ],
      },
      {
        key: "go_live",
        name: "Go-live",
        kind: "milestone",
        offset_days: 80,
        duration_days: 0,
        requires_gate: false,
        description: "Production launch. Set the project's go-live date to start the support window.",
        tasks: [],
      },
      {
        key: "scale",
        name: "Stabilise and handover",
        kind: "phase",
        offset_days: 80,
        duration_days: 90,
        requires_gate: false,
        is_tuning: true,
        description: "90 days of post-launch support, then full IP transfer: code, infrastructure, designs and docs.",
        tasks: [
          ...usageReviews(),
          task("Bug fix log", 0, 90, null),
          deliverable("Documentation", 60, 25, 600),
          deliverable("Handover training", 75, 10, 240),
          ...softwareHandoverDeliverables(),
        ],
      },
    ],
    metrics: [
      { name: "UAT pass rate", unit: "%", direction: "higher", baseline: null, target: 0.95 },
      { name: "Critical defects at launch", unit: "", direction: "lower", baseline: null, target: 0 },
    ],
    risks: [
      {
        kind: "risk",
        category: "scope",
        title: "Requirements change mid-build",
        likelihood: 3,
        impact: 4,
        mitigation: "Freeze scope per phase; changes go into the next phase's price.",
      },
      {
        kind: "risk",
        category: "integration",
        title: "Third-party API limits or changes",
        likelihood: 2,
        impact: 3,
        mitigation: "Prototype risky integrations first.",
      },
      {
        kind: "dependency",
        category: "client_dependency",
        title: "Client review turnaround",
        likelihood: 3,
        impact: 3,
        mitigation: "Agree review slots for every UAT round.",
      },
      {
        kind: "dependency",
        category: "security",
        title: "Access to the client's cloud accounts",
        likelihood: 2,
        impact: 4,
        mitigation: "Request least-privilege access during the Audit.",
      },
    ],
    label_names: [],
  },
};

export const BUILTIN_TEMPLATES: readonly TemplateDefinition[] = [
  AI_DELIVERY,
  AI_READINESS,
  AVLYS_DATA,
  RETAINER,
  CUSTOM_SOFTWARE,
];

export function isBuiltinTemplateKey(value: string): value is BuiltinTemplateKey {
  return (BUILTIN_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function getBuiltinTemplate(key: string): TemplateDefinition | null {
  return BUILTIN_TEMPLATES.find((template) => template.key === key) ?? null;
}

/* ----------------------------- Template keys ------------------------ */

export function templateKeyFor(source: "builtin" | "custom", id: string): string {
  return `${source}:${id}`;
}

/** "builtin:ai_delivery" -> { source: "builtin", id: "ai_delivery" }; null when malformed. */
export function parseTemplateKey(value: string | null | undefined): { source: "builtin" | "custom"; id: string } | null {
  if (!value) return null;
  const match = /^(builtin|custom):(.+)$/.exec(value);
  if (!match) return null;
  const source = match[1] === "builtin" ? "builtin" : "custom";
  if (source === "builtin" && !isBuiltinTemplateKey(match[2])) return null;
  return { source, id: match[2] };
}

/* ------------------------------ Durations --------------------------- */

/** Days from project start to the end of the last non-tuning milestone. */
export function templateBuildDays(payload: TemplatePayload): number {
  return payload.milestones
    .filter((milestone) => !milestone.is_tuning)
    .reduce((max, milestone) => Math.max(max, milestone.offset_days + milestone.duration_days), 0);
}

/** "~9 weeks + 90-day tuning", "~3 weeks", "3 months". */
export function templateDurationLabel(payload: TemplatePayload): string {
  const days = templateBuildDays(payload);
  let build: string;
  if (payload.budget_period === "monthly" && days >= 28) {
    build = `${Math.round(days / 30)} months`;
  } else if (days <= 0) {
    build = "Open-ended";
  } else {
    const weeks = Math.max(1, Math.round(days / 7));
    build = `~${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  const hasTuning = payload.tuning_days > 0 && payload.milestones.some((milestone) => milestone.is_tuning);
  return hasTuning ? `${build} + ${payload.tuning_days}-day tuning` : build;
}

/* ------------------------------ Schedule ---------------------------- */

export interface ScheduledTemplateTask {
  title: string;
  description: string;
  is_deliverable: boolean;
  start_date: string;
  due_date: string;
  estimate_minutes: number | null;
  checklist: string[];
}

export interface ScheduledTemplateMilestone {
  key: string;
  name: string;
  kind: MilestoneKind;
  description: string;
  requires_gate: boolean;
  is_tuning: boolean;
  start_date: string;
  due_date: string;
  tasks: ScheduledTemplateTask[];
}

export interface ScheduledTemplate {
  start_date: string;
  /** Last due date across non-tuning milestones (the planned project due date). */
  build_end_date: string;
  /** Last due date across every milestone, tuning included. */
  end_date: string;
  milestones: ScheduledTemplateMilestone[];
}

function span(start: string, offsetDays: number, durationDays: number): { start_date: string; due_date: string } {
  const startDate = addDaysISO(start, offsetDays);
  return { start_date: startDate, due_date: addDaysISO(startDate, Math.max(durationDays, 1) - 1) };
}

/**
 * Concrete dates for every milestone and task from a project start date
 * ("YYYY-MM-DD"). Used by the dialog preview and by applyTemplate so both
 * agree exactly.
 */
export function computeTemplateSchedule(payload: TemplatePayload, startDate: string): ScheduledTemplate {
  const milestones = [...payload.milestones]
    .sort((a, b) => a.offset_days - b.offset_days)
    .map<ScheduledTemplateMilestone>((milestone) => {
      const dates =
        milestone.kind === "milestone"
          ? { start_date: addDaysISO(startDate, milestone.offset_days), due_date: addDaysISO(startDate, milestone.offset_days) }
          : span(startDate, milestone.offset_days, milestone.duration_days);
      return {
        key: milestone.key,
        name: milestone.name,
        kind: milestone.kind,
        description: milestone.description,
        requires_gate: milestone.requires_gate,
        is_tuning: milestone.is_tuning === true,
        ...dates,
        tasks: milestone.tasks.map((item) => {
          const taskDates = span(dates.start_date, item.offset_days, item.duration_days);
          return {
            title: item.title,
            description: item.description ?? "",
            is_deliverable: item.is_deliverable,
            estimate_minutes: item.estimate_minutes,
            checklist: [...item.checklist],
            ...taskDates,
          };
        }),
      };
    });
  const latest = (items: ScheduledTemplateMilestone[]) =>
    items.reduce((max, item) => (item.due_date > max ? item.due_date : max), startDate);
  return {
    start_date: startDate,
    build_end_date: latest(milestones.filter((milestone) => !milestone.is_tuning)),
    end_date: latest(milestones),
    milestones,
  };
}

/** Whole days covered by a schedule, start to end inclusive. */
export function scheduleLengthDays(schedule: ScheduledTemplate): number {
  return diffDaysISO(schedule.start_date, schedule.end_date) + 1;
}

/* ------------------------------ Options ----------------------------- */

export function builtinTemplateOption(template: TemplateDefinition): TemplateOption {
  return {
    key: templateKeyFor("builtin", template.key),
    source: "builtin",
    id: template.key,
    name: template.name,
    description: template.description,
    icon: template.icon,
    service_lines: [...template.service_lines],
    payload: template.payload,
    build_days: templateBuildDays(template.payload),
    tuning_days: template.payload.tuning_days,
    duration_label: templateDurationLabel(template.payload),
  };
}

export function customTemplateOption(template: ProjectTemplate): TemplateOption {
  return {
    key: templateKeyFor("custom", template.id),
    source: "custom",
    id: template.id,
    name: template.name,
    description: template.description,
    icon: "Bookmark",
    service_lines: template.service_line ? [template.service_line] : [],
    payload: template.payload,
    build_days: templateBuildDays(template.payload),
    tuning_days: template.payload.tuning_days,
    duration_label: templateDurationLabel(template.payload),
  };
}

/** Built-in options in their fixed order. */
export const BUILTIN_TEMPLATE_OPTIONS: readonly TemplateOption[] = BUILTIN_TEMPLATES.map(builtinTemplateOption);
