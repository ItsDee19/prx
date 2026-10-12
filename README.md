# PRX: client delivery for AvlysAI

PRX is AvlysAI's internal project management app for client delivery. Every project is a client engagement: it belongs to a client, runs through delivery phases with go/no-go gates, and carries the tasks, status updates, risks, evals, data batches and time that show whether the work is on track. Commercial data (contract values, phase prices, rates and margin) is visible to admins only and is enforced on the server.

PRX ships with no demo or sample data. A new deployment starts empty, and the first person to register becomes the admin.

## Features

### Delivery

- **Projects and sub-projects.** Engagements with a client, service line, engagement type, currency, owner, members, dates, budget hours and RAG health. Any project can contain sub-projects, nested to any depth, with breadcrumbs and a tree view.
- **Phases and gates.** Delivery phases with deliverables and go/no-go gates. Owners request a review, and admins or the project owner record the decision (Go, optionally with conditions, Extend or Stop) with the client sign-off and evidence.
- **Templates.** Built-in AvlysAI engagement playbooks (phases, tasks, deliverables, metrics and risks per service line), plus custom templates saved from any project. Convert a project to a pilot, or propose a retainer from it.
- **Tasks.** Keyed tasks (PRX-12) with board and list views, assignees, due dates, estimates, checklists, subtasks, blockers, labels and client deliverable approval. Tasks open in a drawer from any page (`?task=PRX-12`).
- **Calendar.** Month and week views of tasks, phases and milestones.
- **Timeline.** A Gantt-style view of projects, phases and tasks, with dependencies and scheduling warnings.

### AvlysAI layer

- **Clients and commercials.** Clients with codes, industry, region, contacts and compliance flags. Contract value, hourly rate, phase prices, invoice status, cost rates and margin are admin-only.
- **Scorecard.** Success metrics per engagement with baseline, target and current values, locked once agreed.
- **Status updates.** Weekly RAG updates (schedule, budget, scope, quality) with what was done, what is next, blockers and client asks. Overdue updates are flagged.
- **Risks.** A RAID log (risks, assumptions, issues, dependencies, decisions) with likelihood, impact, owners and review dates.
- **Evals.** An eval log for AI work: runs with metrics, champion and candidate verdicts, deltas against the champion and run comparison.
- **Data batches.** Batch tracking for data engagements: units delivered and accepted, gold accuracy, agreement scores and thresholds, calibration batches.
- **Go-live tuning.** A go-live date opens a tuning window (90 days by default) with a countdown and a handover checklist.

### Collaboration

- **Notifications.** An inbox for assignments, mentions, comments, status changes, gate reviews, due dates, overdue updates, tuning windows and budget thresholds.
- **@mentions and watchers.** Mention teammates in comments. Watch or mute any project or task.
- **Attachments.** Links on projects and tasks, plus file uploads when Vercel Blob is configured.
- **Search and command menu.** Ctrl+K (Cmd+K on macOS) or `/` searches projects, tasks, clients and people and runs commands.
- **Keyboard shortcuts.** `c` new task, `Shift+C` new project, `t` start or stop the timer, `g` then a letter to jump to a page, `j`/`k` to move through lists, `?` for the full list.

### Insight

- **Time tracking.** A timer, a weekly timesheet and time entries against projects and tasks, with budget burn alerts.
- **Reports.** Delivery, time, team and (admins only) commercial reports with charts and CSV export.
- **Workload.** Weekly capacity per person on the Team page and a workload heatmap in Reports.
- **Home.** Your tasks, updates due, health across your projects and recent activity.
- **Saved views and favourites.** Save filtered projects, tasks, calendar, timeline or reports views to the sidebar (privately or shared), and star projects.

## Deploy to Vercel

PRX runs on Vercel with a Neon Postgres database.

1. **Import the repository.** In Vercel, choose *Add New → Project*, import `ItsDee19/prx` and keep the detected Next.js settings. The first deployment can fail with "DATABASE_URL is not set"; the next step fixes that.
2. **Create and connect the database.** Open the project, go to *Storage → Create Database*, pick **Neon (Serverless Postgres)**, choose the region closest to your Vercel functions and connect it to all environments. Vercel adds `DATABASE_URL` (and related `POSTGRES_*` variables) automatically.
3. **Set the sign-up domain.** Under *Settings → Environment Variables*, add `ALLOWED_EMAIL_DOMAINS=avlysai.com` (comma-separate several domains).
4. **Optional: enable file uploads.** Go to *Storage → Create → Blob* and connect the store to the project. Vercel adds `BLOB_READ_WRITE_TOKEN`. Without it, attachments accept links only.
5. **Redeploy** from the *Deployments* tab so the new variables are picked up.
6. **Claim the admin account.** Open the site, go to `/register` and create your account. **The first person to register becomes the admin.** Add the rest of the team from the Team page, or let colleagues register with a company email address.

The database tables are created automatically the first time the app connects, so there is no migration step. Point an uptime monitor at `GET /api/health`, which returns `{"status":"ok"}` when the database is reachable.

## Local development

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
```

**Option A: embedded Postgres, no cloud database.** Runs PRX against PGlite, stored in `./data/pglite`:

```bash
npm run dev:local
```

**Option B: the Vercel database.** Link the project once, pull its environment variables into `.env.local`, then start the normal dev server:

```bash
vercel link
vercel env pull .env.local
npm run dev
```

Either way the app runs at http://localhost:3000. Open `/register` and create the first account, which becomes the admin. Neon can give each Vercel environment its own database branch, so local development does not have to touch production data. To start the embedded database over, stop the server and delete `./data/pglite`.

## Configuration

Copy `.env.example` to `.env.local` for local overrides.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | none (required) | Postgres connection string. Set automatically by the Vercel Neon integration. `POSTGRES_URL` is used as a fallback. `npm run dev:local` sets it for you. |
| `ALLOWED_EMAIL_DOMAINS` | `avlysai.com` | Comma-separated domains allowed to self-register. Empty allows any address. Admins can always add users from the Team page. |
| `BLOB_READ_WRITE_TOKEN` | none (optional) | Vercel Blob token. Enables file uploads (up to 25 MB) on projects and tasks; without it, attachments are links only. |
| `DATABASE_POOL_MAX` | `5` | Database connections per server instance. |

Workspace settings (timezone, default tuning window, status update cadence, USD to INR rate for approximate margin, labels and templates) are edited by admins under Settings.

## Roles and permissions

| Action | Member | Admin |
| --- | --- | --- |
| View projects, tasks, clients, calendar, timeline and reports (delivery, time, team) | ✓ | ✓ |
| Create and edit projects, tasks, phases, clients, updates, risks, evals and batches; comment and attach | ✓ | ✓ |
| Request a gate review | ✓ | ✓ |
| Decide a gate, close the tuning window | project owner | ✓ |
| Delete a project (and its sub-projects) | creator or owner | ✓ |
| Delete a task or risk | creator or project owner | ✓ |
| Log time; edit own time entries and timesheet | ✓ | ✓ (any user) |
| See contract values, rates, phase prices, invoice status, cost rates, margin and the commercial report | — | ✓ |
| Delete clients; manage labels, custom templates and workspace settings | — | ✓ |
| Add users, change roles, set capacity and cost rates, deactivate, reset passwords | — | ✓ |

Commercial data is stripped in the data layer for members, so it never reaches their pages, payloads or CSV exports.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server using `DATABASE_URL` from `.env.local` |
| `npm run dev:local` | Development server with an embedded local Postgres in `./data/pglite` |
| `npm run build` / `npm start` | Production build and server (the build needs no database) |
| `npm run db:migrate` | Create or update the database tables now (they are also created automatically on first use) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Tech stack

Next.js 15 (App Router, server components and server actions), React 19, TypeScript, Tailwind CSS v4, Radix UI primitives, Motion, cmdk, Recharts (reports only), date-fns, zod, PostgreSQL (Neon on Vercel, PGlite locally) via node-postgres, Vercel Blob for uploads, bcrypt password hashing with cookie sessions. See `SPEC.md` for the architecture, data model and component contracts.
