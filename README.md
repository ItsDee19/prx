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

## Getting started

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev       # http://localhost:3000
```

PRX starts with an empty database (created automatically at `./data/prx.db`). Open `/register` and create the first account: **the first person to register becomes the admin**. Admins then invite the rest of the team from the Team page (or colleagues register themselves with a company email address).

### Optional demo data

To explore PRX with sample projects before using it for real, run `npm run seed`. It creates five example users and a set of projects, and prints the sign-in details in the terminal. Run `npm run seed -- --force` to wipe everything and start over. Do not use the demo accounts in production.

## Configuration

Copy `.env.example` to `.env` and adjust:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALLOWED_EMAIL_DOMAINS` | `avlysai.com` | Comma-separated domains allowed to self-register. Empty allows any address. Admins can always add users from the Team page. |
| `PRX_DB_PATH` | `./data/prx.db` | Location of the SQLite database file. |

## Roles and permissions

| Action | Member | Admin |
| --- | --- | --- |
| View everything, create and edit projects, manage members, comment | ✓ | ✓ |
| Delete a project (and its sub-projects) | creator or owner only | ✓ |
| Add users, change roles, deactivate, reset passwords | — | ✓ |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm start` | Production build and server |
| `npm run seed` | Optional demo data only (`npm run seed -- --force` wipes and re-seeds) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Deploying for the team

1. Copy `.env.example` to `.env` and set `ALLOWED_EMAIL_DOMAINS` to your company domains.
2. `npm run build`, then `npm start` (listens on port 3000; use `npm start -- -p 8080` for another port). Run it behind HTTPS with a reverse proxy such as Caddy or nginx; the session cookie is marked `Secure` when `NODE_ENV=production`, which `npm start` sets.
3. Keep `./data/prx.db` (and its `-wal`/`-shm` sidecars) on persistent storage and back it up regularly — it holds every project, user and comment.
4. Point your uptime monitor at `GET /api/health`, which returns `{"status":"ok"}` when the database is reachable.
5. Register the first account right after deploying so the admin role is claimed by you.

## Tech stack

Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind CSS v4, Radix UI primitives, SQLite via better-sqlite3, bcrypt password hashing with cookie sessions. See `SPEC.md` for the architecture, data model and component contracts.
