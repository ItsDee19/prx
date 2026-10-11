/**
 * PRX demo data. Run with `npm run seed` (tsx honours the `@/` alias).
 *
 *   npm run seed            seeds an empty database, refuses when users exist
 *   npm run seed -- --force wipes every table first, then seeds
 *
 * Only the data layer, password helper, db and utils are imported: nothing
 * from `next/*`, so this runs under plain Node.
 */
import { getDb, resolveDbPath } from "@/lib/db";
import { logActivity } from "@/lib/data/activity";
import { createComment } from "@/lib/data/comments";
import { createProject } from "@/lib/data/projects";
import { countUsers, createUser } from "@/lib/data/users";
import { hashPassword } from "@/lib/password";
import { STATUS_CONFIG } from "@/lib/constants";
import { addDays, todayISODate } from "@/lib/utils";
import type { ActivityType, Priority, ProjectStatus, Role, User } from "@/lib/types";

const PASSWORD = "Avlys2026!";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

type UserKey = "alex" | "priya" | "daniel" | "sofia" | "marcus";

interface SeedUser {
  key: UserKey;
  name: string;
  email: string;
  role: Role;
  job_title: string;
  color: string;
}

const SEED_USERS: SeedUser[] = [
  { key: "alex", name: "Alex Rivera", email: "admin@avlysai.com", role: "admin", job_title: "Head of Engineering", color: "#5b5bd6" },
  { key: "priya", name: "Priya Nair", email: "priya@avlysai.com", role: "member", job_title: "Product Manager", color: "#ec4899" },
  { key: "daniel", name: "Daniel Okafor", email: "daniel@avlysai.com", role: "member", job_title: "ML Engineer", color: "#10b981" },
  { key: "sofia", name: "Sofia Chen", email: "sofia@avlysai.com", role: "member", job_title: "Product Designer", color: "#f59e0b" },
  { key: "marcus", name: "Marcus Lee", email: "marcus@avlysai.com", role: "member", job_title: "Data Engineer", color: "#0ea5e9" },
];

interface SeedProject {
  key: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  owner: UserKey;
  members?: UserKey[];
  /** Day offsets relative to today (negative = past). */
  start: number | null;
  due: number | null;
  progress: number;
  color?: string | null;
  /** Days ago the project was created / last touched / completed. */
  createdDaysAgo: number;
  updatedDaysAgo: number;
  completedDaysAgo?: number;
  children?: SeedProject[];
}

const SEED_PROJECTS: SeedProject[] = [
  {
    key: "atlas",
    name: "Atlas Foundation Model v3",
    description:
      "Train and evaluate the third generation of our in-house foundation model, targeting a 40% reduction in inference cost at equal quality. Covers the data pipeline, the distributed training run, safety tuning and the release checklist.",
    status: "ongoing",
    priority: "urgent",
    owner: "alex",
    members: ["daniel", "marcus", "priya"],
    start: -60,
    due: 5,
    progress: 62,
    color: "#5b5bd6",
    createdDaysAgo: 62,
    updatedDaysAgo: 0,
    children: [
      {
        key: "pipeline",
        name: "Pretraining data pipeline",
        description: "Crawl, filter and shard the v3 corpus; produce the quality report for the training team.",
        status: "completed",
        priority: "high",
        owner: "marcus",
        members: ["daniel"],
        start: -60,
        due: -25,
        progress: 100,
        createdDaysAgo: 60,
        updatedDaysAgo: 24,
        completedDaysAgo: 24,
        children: [
          {
            key: "dedup",
            name: "Deduplication and PII scrubbing",
            description: "MinHash near-duplicate removal plus the PII classifier pass over every shard.",
            status: "completed",
            priority: "medium",
            owner: "marcus",
            start: -58,
            due: -35,
            progress: 100,
            createdDaysAgo: 58,
            updatedDaysAgo: 34,
            completedDaysAgo: 34,
          },
          {
            key: "tokenizer",
            name: "Tokenizer retraining",
            description: "Retrain the BPE tokenizer on the cleaned corpus with a 128k vocabulary and code-aware merges.",
            status: "ongoing",
            priority: "medium",
            owner: "daniel",
            start: -30,
            due: 9,
            progress: 40,
            createdDaysAgo: 30,
            updatedDaysAgo: 1,
          },
        ],
      },
      {
        key: "training",
        name: "Distributed training run",
        description: "The main 2k-GPU run with checkpointing every 500 steps and automatic node replacement.",
        status: "ongoing",
        priority: "urgent",
        owner: "daniel",
        members: ["marcus"],
        start: -25,
        due: 5,
        progress: 55,
        createdDaysAgo: 26,
        updatedDaysAgo: 0,
      },
      {
        key: "rlhf",
        name: "Safety fine-tuning (RLHF)",
        description: "Preference data collection, reward model training and the red-team evaluation gate before release.",
        status: "to_start",
        priority: "high",
        owner: "alex",
        members: ["priya"],
        start: 6,
        due: 20,
        progress: 0,
        createdDaysAgo: 10,
        updatedDaysAgo: 4,
      },
    ],
  },
  {
    key: "nimbus",
    name: "Nimbus Inference Platform",
    description:
      "Multi-tenant model-serving platform on Kubernetes with autoscaling GPU pools, canary deployments and per-customer rate limits.",
    status: "ongoing",
    priority: "high",
    owner: "daniel",
    members: ["marcus", "sofia"],
    start: -45,
    due: -4,
    progress: 45,
    color: "#0ea5e9",
    createdDaysAgo: 46,
    updatedDaysAgo: 1,
    children: [
      {
        key: "gpupool",
        name: "Autoscaling GPU pool",
        description: "Scale-to-zero node groups with spot fallback and a budget alert when burn rate exceeds plan.",
        status: "ongoing",
        priority: "high",
        owner: "daniel",
        members: ["marcus"],
        start: -40,
        due: -2,
        progress: 65,
        createdDaysAgo: 40,
        updatedDaysAgo: 1,
      },
      {
        key: "latency",
        name: "Latency dashboard",
        description: "Per-model p50/p95/p99 latency and token throughput, broken down by tenant.",
        status: "ongoing",
        priority: "medium",
        owner: "sofia",
        members: ["daniel"],
        start: -14,
        due: 4,
        progress: 35,
        createdDaysAgo: 15,
        updatedDaysAgo: 2,
        children: [
          {
            key: "grafana",
            name: "Grafana panels for p95/p99",
            description: "Panel layout, alert thresholds and the shared dashboard link for on-call.",
            status: "to_start",
            priority: "low",
            owner: "sofia",
            start: 1,
            due: 4,
            progress: 0,
            createdDaysAgo: 3,
            updatedDaysAgo: 3,
          },
        ],
      },
    ],
  },
  {
    key: "copilot",
    name: "Customer Insights Copilot",
    description:
      "Conversational analytics assistant for customer success teams: summarises support conversations, surfaces churn signals and drafts follow-ups.",
    status: "ongoing",
    priority: "medium",
    owner: "priya",
    members: ["daniel", "sofia"],
    start: -30,
    due: 21,
    progress: 30,
    color: "#10b981",
    createdDaysAgo: 31,
    updatedDaysAgo: 2,
    children: [
      {
        key: "summaries",
        name: "Conversation summarisation",
        description: "Few-shot summaries of multi-turn tickets with a faithfulness check against the source thread.",
        status: "ongoing",
        priority: "medium",
        owner: "priya",
        members: ["daniel"],
        start: -25,
        due: 14,
        progress: 50,
        createdDaysAgo: 25,
        updatedDaysAgo: 2,
      },
      {
        key: "sentiment",
        name: "Sentiment model A/B test",
        description: "Compare the fine-tuned classifier against the zero-shot baseline on last quarter's tickets.",
        status: "on_hold",
        priority: "low",
        owner: "daniel",
        start: -20,
        due: 30,
        progress: 20,
        createdDaysAgo: 20,
        updatedDaysAgo: 8,
      },
    ],
  },
  {
    key: "evalharness",
    name: "Evaluation Harness 2.0",
    description:
      "Rebuild the model evaluation harness with reproducible benchmark runs, regression alerts and a leaderboard shared with research.",
    status: "to_start",
    priority: "high",
    owner: "marcus",
    members: ["daniel"],
    start: 7,
    due: 40,
    progress: 0,
    color: "#8b5cf6",
    createdDaysAgo: 5,
    updatedDaysAgo: 3,
    children: [
      {
        key: "benchmarks",
        name: "Benchmark suite selection",
        description: "Pick the public and internal benchmarks that gate every release, with owners for each.",
        status: "to_start",
        priority: "medium",
        owner: "marcus",
        start: 7,
        due: 18,
        progress: 0,
        createdDaysAgo: 4,
        updatedDaysAgo: 4,
      },
    ],
  },
  {
    key: "lakehouse",
    name: "Data Lakehouse Migration",
    description:
      "Move the training corpus and product telemetry from the legacy warehouse to an Iceberg-based lakehouse with lineage and access controls.",
    status: "on_hold",
    priority: "medium",
    owner: "marcus",
    members: ["daniel"],
    start: -90,
    due: -10,
    progress: 55,
    color: "#f59e0b",
    createdDaysAgo: 92,
    updatedDaysAgo: 12,
  },
  {
    key: "designsys",
    name: "Design System Refresh",
    description:
      "Unify the product UI under one component library and token set, with dark mode and accessibility built in from the start.",
    status: "ongoing",
    priority: "low",
    owner: "sofia",
    members: ["priya"],
    start: -20,
    due: 3,
    progress: 70,
    color: "#ec4899",
    createdDaysAgo: 21,
    updatedDaysAgo: 0,
    children: [
      {
        key: "darktokens",
        name: "Dark mode tokens",
        description: "Semantic colour tokens for both themes, verified against WCAG AA contrast.",
        status: "completed",
        priority: "low",
        owner: "sofia",
        start: -20,
        due: -7,
        progress: 100,
        createdDaysAgo: 20,
        updatedDaysAgo: 6,
        completedDaysAgo: 6,
      },
      {
        key: "audit",
        name: "Component audit",
        description: "Inventory every bespoke component in the app and map it to the new library.",
        status: "ongoing",
        priority: "medium",
        owner: "sofia",
        members: ["priya"],
        start: -12,
        due: 2,
        progress: 60,
        createdDaysAgo: 12,
        updatedDaysAgo: 0,
      },
    ],
  },
  {
    key: "raiaudit",
    name: "Responsible AI Audit Q4",
    description:
      "Quarterly review of model behaviour, bias metrics and incident reports ahead of the enterprise compliance renewal.",
    status: "to_start",
    priority: "urgent",
    owner: "alex",
    members: ["priya", "daniel"],
    start: 2,
    due: 6,
    progress: 0,
    color: "#ef4444",
    createdDaysAgo: 4,
    updatedDaysAgo: 1,
  },
  {
    key: "rag",
    name: "RAG Knowledge Assistant",
    description:
      "Internal retrieval-augmented assistant over engineering docs, runbooks and past incident reviews, with citations on every answer.",
    status: "completed",
    priority: "high",
    owner: "daniel",
    members: ["marcus", "sofia"],
    start: -75,
    due: -14,
    progress: 100,
    color: "#14b8a6",
    createdDaysAgo: 76,
    updatedDaysAgo: 12,
    completedDaysAgo: 12,
    children: [
      {
        key: "vectorstore",
        name: "Vector store evaluation",
        description: "Recall and latency comparison of three managed vector databases on our document set.",
        status: "completed",
        priority: "medium",
        owner: "daniel",
        members: ["marcus"],
        start: -70,
        due: -45,
        progress: 100,
        createdDaysAgo: 70,
        updatedDaysAgo: 44,
        completedDaysAgo: 44,
      },
    ],
  },
  {
    key: "stt",
    name: "Speech-to-Text Pilot",
    description:
      "Pilot of a streaming transcription model for the support call centre. Stopped after the vendor evaluation showed a better cost/quality trade-off elsewhere.",
    status: "cancelled",
    priority: "low",
    owner: "priya",
    start: -120,
    due: -30,
    progress: 20,
    color: null,
    createdDaysAgo: 121,
    updatedDaysAgo: 35,
  },
  {
    key: "soc2",
    name: "SOC 2 Readiness",
    description:
      "Controls, policies and evidence collection for the SOC 2 Type II audit, including quarterly access reviews and vendor risk assessments.",
    status: "completed",
    priority: "medium",
    owner: "alex",
    members: ["marcus"],
    start: -150,
    due: -50,
    progress: 100,
    color: null,
    createdDaysAgo: 152,
    updatedDaysAgo: 45,
    completedDaysAgo: 45,
  },
];

interface SeedComment {
  project: string;
  author: UserKey;
  body: string;
  daysAgo: number;
  hoursAgo?: number;
}

const SEED_COMMENTS: SeedComment[] = [
  { project: "atlas", author: "priya", body: "Roadmap review moved to Thursday. Can we have the v3 eval numbers before then?", daysAgo: 3 },
  { project: "atlas", author: "daniel", body: "Checkpoint 4 is stable. The loss curve matches the v2 run at 60% of the compute; full report tomorrow.", daysAgo: 1 },
  { project: "training", author: "marcus", body: "Node 7 dropped out of the job twice last night. Swapped it out and the run resumed from the last checkpoint.", daysAgo: 0, hoursAgo: 5 },
  { project: "nimbus", author: "daniel", body: "The autoscaler still over-provisions on bursty traffic. Trying a longer cooldown window before we call this done.", daysAgo: 2 },
  { project: "gpupool", author: "marcus", body: "Spot-instance fallback is working end to end. The remaining item is the budget alert.", daysAgo: 1 },
  { project: "copilot", author: "sofia", body: "Updated the summary card mockups in Figma; link is in the design channel.", daysAgo: 4 },
  { project: "designsys", author: "priya", body: "Love the new tokens. Can we also cover the empty states on the dashboard?", daysAgo: 2 },
  { project: "lakehouse", author: "marcus", body: "Parking this until the catalog vendor confirms pricing for the Iceberg tier.", daysAgo: 12 },
  { project: "raiaudit", author: "alex", body: "Kickoff is next Monday. Priya, please bring last quarter's bias metrics.", daysAgo: 1 },
  { project: "rag", author: "sofia", body: "Shipped! The onboarding guide is linked from the engineering wiki.", daysAgo: 12 },
];

/* -------------------------------- Helpers -------------------------------- */

const db = getDb();
const today = todayISODate();

/** ISO timestamp `daysAgo` days (and `hoursAgo` hours) before now. */
function stamp(daysAgo: number, hoursAgo = 0): string {
  return new Date(Date.now() - daysAgo * DAY_MS - hoursAgo * HOUR_MS).toISOString();
}

function offsetDate(days: number | null): string | null {
  return days === null ? null : addDays(today, days);
}

/** logActivity stamps "now"; rewrite the newest row so the timeline reads realistically. */
function logAt(
  input: { project_id: string | null; actor_id: string | null; type: ActivityType; message: string; meta?: Record<string, unknown> },
  at: string,
): void {
  logActivity(input);
  db.prepare("UPDATE activity SET created_at = ? WHERE rowid = (SELECT MAX(rowid) FROM activity)").run(at);
}

function wipe(): void {
  db.transaction(() => {
    for (const table of ["activity", "comments", "project_members", "sessions", "projects", "users"]) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  })();
}

/* --------------------------------- Seed ---------------------------------- */

async function seedUsers(): Promise<Record<UserKey, User>> {
  const users = {} as Record<UserKey, User>;
  for (const seed of SEED_USERS) {
    const user = createUser({
      name: seed.name,
      email: seed.email,
      password_hash: await hashPassword(PASSWORD),
      role: seed.role,
      color: seed.color,
      job_title: seed.job_title,
    });
    const joined = stamp(180 - SEED_USERS.indexOf(seed) * 7);
    db.prepare("UPDATE users SET created_at = ?, updated_at = ? WHERE id = ?").run(joined, joined, user.id);
    users[seed.key] = user;
  }
  return users;
}

function seedProject(
  seed: SeedProject,
  users: Record<UserKey, User>,
  parent: { id: string; name: string } | null,
  ids: Map<string, string>,
): number {
  const owner = users[seed.owner];
  const createdAt = stamp(seed.createdDaysAgo, 3);
  const updatedAt = stamp(seed.updatedDaysAgo, 2);
  const completedAt = seed.completedDaysAgo !== undefined ? stamp(seed.completedDaysAgo, 1) : null;
  const memberIds = (seed.members ?? []).map((key) => users[key].id);

  const project = createProject(
    {
      name: seed.name,
      description: seed.description,
      status: seed.status,
      priority: seed.priority,
      owner_id: owner.id,
      start_date: offsetDate(seed.start),
      due_date: offsetDate(seed.due),
      progress: seed.progress,
      color: seed.color ?? null,
      parent_id: parent?.id ?? null,
      member_ids: memberIds,
    },
    owner.id,
  );
  ids.set(seed.key, project.id);

  db.prepare("UPDATE projects SET created_at = ?, updated_at = ?, completed_at = ? WHERE id = ?").run(
    createdAt,
    updatedAt,
    seed.status === "completed" ? completedAt ?? updatedAt : null,
    project.id,
  );
  db.prepare("UPDATE project_members SET added_at = ? WHERE project_id = ?").run(createdAt, project.id);

  logAt(
    {
      project_id: project.id,
      actor_id: owner.id,
      type: "project_created",
      message: parent ? "created the sub-project" : "created the project",
      meta: { name: seed.name, status: "to_start", parent_id: parent?.id ?? null },
    },
    createdAt,
  );
  if (parent) {
    logAt(
      {
        project_id: parent.id,
        actor_id: owner.id,
        type: "subproject_created",
        message: `added sub-project "${seed.name}"`,
        meta: { subproject_id: project.id, name: seed.name },
      },
      createdAt,
    );
  }
  for (const key of seed.members ?? []) {
    logAt(
      {
        project_id: project.id,
        actor_id: owner.id,
        type: "member_added",
        message: `added ${users[key].name} as a member`,
        meta: { user_id: users[key].id, name: users[key].name },
      },
      stamp(seed.createdDaysAgo, 2),
    );
  }
  if (seed.status !== "to_start") {
    // Every non-fresh project left "To Start" at some point; completed ones went through "Ongoing".
    const midway = stamp(Math.max(seed.updatedDaysAgo, Math.round((seed.createdDaysAgo + seed.updatedDaysAgo) / 2)), 1);
    const firstStatus: ProjectStatus = seed.status === "completed" || seed.status === "cancelled" ? "ongoing" : seed.status;
    logAt(
      {
        project_id: project.id,
        actor_id: owner.id,
        type: "status_changed",
        message: `changed status from ${STATUS_CONFIG.to_start.label} to ${STATUS_CONFIG[firstStatus].label}`,
        meta: { from: "to_start", to: firstStatus },
      },
      midway,
    );
    if (firstStatus !== seed.status) {
      logAt(
        {
          project_id: project.id,
          actor_id: owner.id,
          type: "status_changed",
          message: `changed status from ${STATUS_CONFIG[firstStatus].label} to ${STATUS_CONFIG[seed.status].label}`,
          meta: { from: firstStatus, to: seed.status },
        },
        completedAt ?? updatedAt,
      );
    }
  }
  if (seed.progress > 0 && seed.status !== "completed") {
    const previous = Math.max(0, seed.progress - 15);
    logAt(
      {
        project_id: project.id,
        actor_id: owner.id,
        type: "progress_updated",
        message: `updated progress from ${previous}% to ${seed.progress}%`,
        meta: { from: previous, to: seed.progress },
      },
      updatedAt,
    );
  }

  let count = 1;
  for (const child of seed.children ?? []) {
    count += seedProject(child, users, { id: project.id, name: seed.name }, ids);
  }
  return count;
}

function seedComments(users: Record<UserKey, User>, ids: Map<string, string>): number {
  let count = 0;
  for (const seed of SEED_COMMENTS) {
    const projectId = ids.get(seed.project);
    if (!projectId) throw new Error(`Unknown project key "${seed.project}" in SEED_COMMENTS`);
    const author = users[seed.author];
    const at = stamp(seed.daysAgo, seed.hoursAgo ?? 6);
    const comment = createComment(projectId, author.id, seed.body);
    db.prepare("UPDATE comments SET created_at = ?, updated_at = ? WHERE id = ?").run(at, at, comment.id);
    const excerpt = seed.body.length > 80 ? `${seed.body.slice(0, 79).trimEnd()}…` : seed.body;
    logAt(
      {
        project_id: projectId,
        actor_id: author.id,
        type: "comment_added",
        message: `commented: "${excerpt}"`,
        meta: { comment_id: comment.id },
      },
      at,
    );
    count += 1;
  }
  return count;
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  console.log(`PRX seed -> ${resolveDbPath()}`);

  const existing = countUsers();
  if (existing > 0) {
    if (!force) {
      console.log(`Database already contains ${existing} user(s). Nothing changed.`);
      console.log("Re-run with --force to wipe every table and seed again:  npm run seed -- --force");
      return;
    }
    wipe();
    console.log("Wiped all tables (--force).");
  }

  const users = await seedUsers();
  const ids = new Map<string, string>();
  let projectCount = 0;
  for (const seed of SEED_PROJECTS) {
    projectCount += seedProject(seed, users, null, ids);
  }
  const commentCount = seedComments(users, ids);
  const activityCount = db.prepare<[], number>("SELECT COUNT(*) FROM activity").pluck().get() ?? 0;

  console.log("");
  console.log(`Seeded ${SEED_USERS.length} users, ${SEED_PROJECTS.length} top-level projects (${projectCount} including sub-projects), ${commentCount} comments and ${activityCount} activity entries.`);
  console.log("");
  console.log("Sign in with any of these accounts:");
  console.log("");
  const emailWidth = Math.max(...SEED_USERS.map((u) => u.email.length));
  const nameWidth = Math.max(...SEED_USERS.map((u) => u.name.length));
  for (const u of SEED_USERS) {
    console.log(`  ${u.name.padEnd(nameWidth)}  ${u.email.padEnd(emailWidth)}  ${u.role.padEnd(6)}  password: ${PASSWORD}`);
  }
  console.log("");
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
