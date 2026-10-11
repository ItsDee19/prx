# PRX — Project management for AvlysAI

PRX is AvlysAI's internal project tracker. Team members sign in, see what is ongoing, what is still to start and what has shipped, and break large projects into nested sub-projects.

## Features

- **Projects with status & priority** — To Start, Ongoing, On Hold, Completed, Cancelled; Low → Urgent priority; owner, members, start/due dates, progress.
- **Sub-projects** — any project can contain sub-projects, nested to any depth, with breadcrumbs, a tree view and roll-up counts.
- **Board and list views** — drag cards between status columns, or sort and filter a table. Filters live in the URL so views can be shared.
- **Dashboard** — status overview, your projects, upcoming and overdue deadlines, recent activity.
- **Collaboration** — comments and an activity log on every project.
- **Team & roles** — self-registration restricted to company email domains; admins manage members, roles and password resets.
- **Polished UI** — responsive layout, dark mode, keyboard accessible.

## Deploy to Vercel

PRX is built for Vercel with a Neon Postgres database (Vercel's built-in database offering).

1. **Import the repository.** In Vercel, choose *Add New → Project*, import `ItsDee19/prx`, and keep the detected Next.js settings. The first deployment can fail with "DATABASE_URL is not set"; the next step fixes that.
2. **Create and connect the database.** Open the project, go to *Storage → Create Database*, pick **Neon (Serverless Postgres)**, choose the region closest to your Vercel functions, and connect it to all environments. Vercel adds `DATABASE_URL` (and related `POSTGRES_*` variables) to the project automatically.
3. **Set the sign-up domain.** Under *Settings → Environment Variables*, add `ALLOWED_EMAIL_DOMAINS=avlysai.com` (comma-separate several domains).
4. **Redeploy** from the *Deployments* tab so the new variables are picked up.
5. **Claim the admin account.** Open the site, go to `/register` and create your account. **The first person to register becomes the admin.** Invite the rest of the team from the Team page, or let colleagues register with a company email address.

The database tables are created automatically the first time the app connects, so there is no migration step. Point an uptime monitor at `GET /api/health`, which returns `{"status":"ok"}` when the database is reachable.

## Local development

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
```

**Option A: no cloud database.** Run PRX against an embedded Postgres stored in `./data/pglite`:

```bash
npm run dev:local
```

**Option B: use the Vercel database.** Link the project once and pull its environment variables into `.env.local`, then start the normal dev server:

```bash
vercel link
vercel env pull .env.local
npm run dev
```

Either way the app runs at http://localhost:3000. Neon can give each Vercel environment its own database branch, so local development does not have to touch production data.

### Optional demo data

To explore PRX with sample projects, load demo data. It creates five example users and a set of projects, and prints the sign-in details in the terminal. Add `-- --force` to wipe everything and start over. Never load demo data into the production database.

```bash
npm run seed:local
```

Use `npm run seed` instead to seed whatever database `DATABASE_URL` in `.env.local` points to.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | none (required) | Postgres connection string. Set automatically by the Vercel Neon integration. `POSTGRES_URL` is used as a fallback. |
| `ALLOWED_EMAIL_DOMAINS` | `avlysai.com` | Comma-separated domains allowed to self-register. Empty allows any address. Admins can always add users from the Team page. |
| `DATABASE_POOL_MAX` | `5` | Database connections per server instance. |

## Roles and permissions

| Action | Member | Admin |
| --- | --- | --- |
| View everything, create and edit projects, manage members, comment | ✓ | ✓ |
| Delete a project (and its sub-projects) | creator or owner only | ✓ |
| Add users, change roles, deactivate, reset passwords | — | ✓ |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server using `DATABASE_URL` from `.env.local` |
| `npm run dev:local` | Development server with an embedded local Postgres |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Create database tables now (they are also created automatically on first use) |
| `npm run seed` / `npm run seed:local` | Optional demo data for the configured or local database |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Tech stack

Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind CSS v4, Radix UI primitives, PostgreSQL (Neon on Vercel) via node-postgres, bcrypt password hashing with cookie sessions. See `SPEC.md` for the architecture, data model and component contracts.
