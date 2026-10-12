# PRX — Build Specification

> **v2 (sections 15-24) extends this document** with the AvlysAI delivery model (clients, phases, tasks, collaboration, time, scorecard, RAID, evals, data batches, reports, productivity) and the Aurora Grid redesign. Sections 1-14 still apply except where a v2 section or an inline **[v2: ...]** marker supersedes them; when they disagree, v2 wins. Agents must read the whole file, then the v2 section for their role (§22 lists who owns what).

PRX is AvlysAI's internal project management app. Team members sign in, see a dashboard, and create/edit projects. Every project can contain sub-projects, nested to any depth. This document is the single source of truth for everyone building it. Read it fully before writing code; the contract files it references already exist and must not be changed without updating this spec:

- `src/lib/types.ts` — all domain types, filters, action result shapes
- `src/lib/constants.ts` — status/priority config, labels, colours, cookie name, nav items
- `src/lib/utils.ts` — `cn`, date helpers, `initials`, `isOverdue`, `relativeTime`, etc.
- `src/lib/db.ts` — Postgres access via node-postgres: `db` (query/queryOne/execute), `transaction()`, `ensureSchema()`, `pingDatabase()`, `closeDb()`, `newId()`, `nowISO()` and the full SQL schema (created automatically on first use)

## 1. Product scope

- Statuses: To Start, Ongoing, On Hold, Completed, Cancelled (`ProjectStatus`). Priorities: Low, Medium, High, Urgent.
- Project fields: name, description, status, priority, owner, members, start date, due date, progress (0–100, manual), optional colour, parent (for sub-projects). **[v2: projects are client engagements with client, service line, engagement type, currency, admin-only contract value, delivery state, hours budget, health, go-live/tuning window and `progress_mode`; progress is derived unless `progress_mode = 'manual'`, which every pre-v2 project keeps. See §16.]**
- Sub-projects are ordinary projects with `parent_id` set. Unlimited depth. A project page shows its sub-project tree, breadcrumbs to ancestors, members, comments and an activity log.
- Users: `admin` or `member`. Any active user can create/edit projects, manage members and comment. Only admins, the project creator, or the project owner may delete a project (cascades to sub-projects). Only admins manage users (create, change role, deactivate, reset password). Users are never deleted, only deactivated.
- Self-registration at `/register` is restricted to email domains in `ALLOWED_EMAIL_DOMAINS` (env, comma separated; default `avlysai.com`; empty = any). The very first user to register becomes admin.

## 2. Stack and conventions

- Next.js 15.5 App Router, React 19, TypeScript strict, Tailwind CSS v4 (`@import "tailwindcss"` in `src/app/globals.css`), `radix-ui` (unified package: `import { Dialog, DropdownMenu, Popover, Tooltip } from "radix-ui"`), `lucide-react` icons, `sonner` toasts, `zod` v4, `bcryptjs`, `pg` (node-postgres) with `@vercel/functions` `attachDatabasePool`, `@dnd-kit/*`. Deployed on Vercel with a Neon Postgres database (`DATABASE_URL`); local development can use an embedded PGlite server (`npm run dev:local`).
- Path alias `@/*` → `src/*`. Server components by default; add `"use client"` only where hooks/events are needed. Server-only modules (`src/lib/auth.ts`, `src/lib/data/*`, `src/actions/*`) must never be imported from client components; client components receive data via props and call server actions.
- The data layer (`src/lib/data/*`) and `src/lib/password.ts` must NOT import anything from `next/*` so plain Node scripts (e.g. `scripts/migrate.ts`) can import them.
- Mutations go through server actions in `src/actions/*.ts` (`"use server"` at the top). Every action: (1) `requireUser()` (or `requireAdmin()`), (2) validate with zod, (3) call the data layer, (4) `revalidatePath("/", "layout")`, (5) return `ActionResult`. Wrap in try/catch and return `{ ok: false, error }` with a friendly message — never throw to the client except `redirect()`.
- IDs are `newId()` (UUID). Timestamps are `nowISO()`. Date-only fields are `"YYYY-MM-DD"` strings or `null`; treat `""` as `null`.
- No `any`, no `@ts-ignore`, no unused imports (ESLint must pass). Use `cn()` for class merging. Keep components small and co-located under `src/components/<area>/`.
- Date display: use `formatDate` (deterministic). Relative times only via the `<TimeAgo>` client component (avoids hydration mismatches).
- Every interactive control needs an accessible name (visible label, `aria-label`, or `<Tooltip>` + `sr-only` text), a visible focus ring (`focus-visible:ring-2 ring-accent`), and keyboard support. Dialogs need a title.

## 3. Directory map

```
src/app/layout.tsx                 root: fonts, theme script, TooltipProvider, Toaster
src/app/page.tsx                   redirect("/dashboard")
src/app/not-found.tsx
src/app/(auth)/layout.tsx          centered auth layout with brand panel
src/app/(auth)/login/page.tsx
src/app/(auth)/register/page.tsx
src/app/(app)/layout.tsx           requireUser() → <AppShell user>
src/app/(app)/dashboard/page.tsx
src/app/(app)/projects/page.tsx    list/board of top-level projects + filters (searchParams)
src/app/(app)/projects/[id]/page.tsx  project detail (sub-projects tree, members, comments, activity)
src/app/(app)/team/page.tsx
src/app/(app)/settings/page.tsx
src/middleware.ts                  cookie presence gate
src/lib/{types,constants,utils,db}.ts        (exist — contract)
src/lib/password.ts                hashPassword / verifyPassword (bcryptjs)
src/lib/auth.ts                    cookies + sessions: getCurrentUser, requireUser, requireAdmin, login/logout helpers
src/lib/validation.ts              zod schemas + fieldErrors helper
src/lib/data/{users,sessions,projects,comments,activity}.ts
src/actions/{auth,projects,comments,users}.ts
src/components/ui/*                design-system primitives (see §9)
src/components/layout/*            app shell, sidebar, topbar, user menu, theme toggle
src/components/projects/*          status/priority badges, due date, project dialog, card, board, list, tree, status select
src/components/dashboard/*         stat cards, lists
src/components/team/*, src/components/settings/*, src/components/auth/*
```

**[v2: new files and their owners are listed in §22. New shared libs: `src/lib/money.ts`, `src/lib/duration.ts`, `src/lib/workspace-time.ts`, `src/lib/templates.ts`.]**

## 4. Data model

**[v2: `SCHEMA = SCHEMA_V1 + SCHEMA_V2`; the v2 tables and columns are summarised in §16. The bootstrap is version-gated by the `schema_version` table and `SCHEMA_VERSION` (§16, bootstrap rules).]** See the SQL in `src/lib/db.ts` (PostgreSQL). Timestamps are ISO-8601 UTC strings and date-only fields are `"YYYY-MM-DD"` strings, both stored as TEXT so they sort and compare correctly as text. `users.is_active` is BOOLEAN and `activity.meta` is JSONB. `COUNT(*)` returns bigint, which node-postgres returns as a string, so counts are always cast with `::int`. `sessions.id` stores the SHA-256 hex of the cookie token (never the raw token).

## 5. Data layer API (`src/lib/data/*.ts`) — exact exports

All functions are `async` and return a Promise of the type listed below (the signatures show the resolved type). They use parameterised queries (`$1`, `$2`, …, never string interpolation of values), run multi-statement writes inside `transaction()`, and return the types from `src/lib/types.ts`. Callers must `await` every call; pages should load independent data with `Promise.all` because the database is remote.

`src/lib/data/users.ts`
- `listUsers(opts?: { includeInactive?: boolean }): User[]` — sorted by name; active only by default.
- `listUserSummaries(): UserSummary[]` — active users, for pickers.
- `getUserById(id: string): User | null`
- `getUserByEmail(email: string): User | null` — email compared lower-cased.
- `getUserAuthByEmail(email: string): (User & { password_hash: string }) | null`
- `getPasswordHash(userId: string): string | null`
- `countUsers(): number`, `countAdmins(): number` (active admins)
- `createUser(input: { name: string; email: string; password_hash: string; role: Role; color?: string; job_title?: string | null }): User` — lower-cases email; default colour via `colorFromString(email)`.
- `updateUser(id: string, patch: Partial<Pick<User, "name" | "job_title" | "color" | "role" | "is_active">>): User`
- `updatePassword(userId: string, password_hash: string): void`
- `getUserProjectCounts(): Record<string, number>` — per user id, number of OPEN projects where they are owner or member.

`src/lib/data/sessions.ts`
- `createSession(userId: string): { token: string; expiresAt: string }` — token = 32 random bytes base64url; store sha256 hex; expiry `SESSION_DURATION_DAYS`.
- `getUserBySessionToken(token: string): User | null` — null if missing, expired, or user inactive (delete expired rows opportunistically).
- `deleteSessionByToken(token: string): void`, `deleteUserSessions(userId: string): void`

`src/lib/data/projects.ts`
- `listProjects(filters?: ProjectFilters): ProjectWithMeta[]` — see `ProjectFilters` docs in types.ts. Default sort `updated` (desc). `sort: "priority"` orders urgent→low then updated. `sort: "position"` orders by position asc, then created asc. `sort: "due_date"` puts nulls last.
- `getProject(id: string): ProjectWithMeta | null`
- `getProjectAncestors(id: string): ProjectAncestor[]` — root first, excluding the project itself (recursive CTE).
- `getSubprojectTree(id: string): ProjectTreeNode[]` — direct children with nested `children`, each hydrated as ProjectWithMeta, ordered by position then created.
- `getSubtreeIds(id: string): string[]` — the project id plus every descendant id.
- `countSubtree(id: string): { total: number; completed: number }` — all descendants (any depth), excluding the project itself.
- `createProject(input: CreateProjectInput, createdBy: string): Project` — position = max(position)+1 among siblings; if status is `completed`, set `completed_at`; insert members from `member_ids`.
- `updateProject(id: string, patch: UpdateProjectInput): Project` — only touches provided keys; maintains `completed_at` (set when status becomes completed, cleared when it leaves completed); if `member_ids` is provided, replaces the member set; bumps `updated_at`.
- `deleteProject(id: string): void` — relies on ON DELETE CASCADE. **[v2: returns `{ blob_urls: string[] }` (§17.4); v1 callers ignore it.]**
- `setProjectMembers(id: string, userIds: string[]): UserSummary[]` and `getProjectMembers(id: string): UserSummary[]`
- `reorderProjects(parentId: string | null, orderedIds: string[]): void` — rewrites `position` 0..n in a transaction.
- `getProjectStats(scope?: "top_level" | "all"): ProjectStats` — default `top_level`. **[v2: `today` parameter, default `await getWorkspaceToday()` (§17.4).]** `overdue` = open projects with due_date < today. `due_this_week` = open with due_date within today..today+7. `completed_last_30_days` by `completed_at`.
- `listUpcomingDeadlines(limit?: number): ProjectWithMeta[]` — open projects with a due date, soonest first (overdue included, first).
- `listMyProjects(userId: string, limit?: number): ProjectWithMeta[]` — open projects where user is owner, creator or member, by updated desc.
- Hydration helper (internal): fetch rows, then owner/parent_name via joins, members via one grouped query, sub-project counts and comment counts via correlated subqueries. Avoid N+1 per row beyond that.

`src/lib/data/comments.ts`
- `listComments(projectId: string): Comment[]` (oldest first, with `author`), `getComment(id): Comment | null`, `createComment(projectId, userId, body): Comment`, `deleteComment(id): void` **[v2: `Comment.task_id`; `listComments` returns project-level comments only (`task_id IS NULL`) and `ProjectWithMeta.comment_count` counts only those; `deleteComment` returns `{ blob_urls: string[] }`. Task comments: §17.]**

**[v2: every `listProjects`/`getProject`/`getSubprojectTree`/`listUpcomingDeadlines`/`listMyProjects`/`createProject`/`updateProject` takes an optional trailing `options: ProjectQueryOptions`; admin-only fields are `null` unless `includeCommercial: true`. New filters and hydrated fields: §17.]**

`src/lib/data/activity.ts`
- `logActivity(input: { project_id: string | null; actor_id: string | null; type: ActivityType; message: string; meta?: Record<string, unknown> }): void`
- `listProjectActivity(projectId: string, limit?: number): Activity[]` — newest first, includes activity of the project itself only (not descendants).
- `listRecentActivity(limit?: number): Activity[]` — newest first across all projects, with `project_name`.

## 6. Auth

`src/lib/password.ts`: `hashPassword(plain): Promise<string>` (bcryptjs, cost 10), `verifyPassword(plain, hash): Promise<boolean>`.

`src/lib/auth.ts` (starts with `import "server-only"` — add the `server-only` package if missing, or guard otherwise; uses `cookies()` from `next/headers`, which is async in Next 15):
- `getCurrentUser(): Promise<User | null>` — wrapped in React `cache()`; reads `SESSION_COOKIE`.
- `requireUser(): Promise<User>` — `redirect("/login")` when absent.
- `requireAdmin(): Promise<User>` — `redirect("/dashboard")` when not admin.
- `startSession(userId: string): Promise<void>` — createSession + set cookie (httpOnly, sameSite "lax", path "/", secure in production, expires = session expiry).
- `endSession(): Promise<void>` — delete DB session + clear cookie.
- `canDeleteProject(user: User, project: Project): boolean` — admin || creator || owner.
- `getAllowedEmailDomains(): string[]` — from env, falling back to `DEFAULT_ALLOWED_EMAIL_DOMAINS`.

`src/middleware.ts`: if path is not `/login` or `/register` and the session cookie is missing → redirect to `/login?next=<pathname>`; if the cookie is present and the path is `/login` or `/register` → redirect `/dashboard`. Matcher excludes `_next`, `favicon.ico`, and static file extensions. Cookie presence only (no DB access in middleware). Real validation happens in `(app)/layout.tsx` via `requireUser()`.

## 7. Server actions (`src/actions/*.ts`) — exact exports

`src/actions/auth.ts`
- `loginAction(prev: FormState, formData: FormData): Promise<FormState>` — fields `email`, `password`, optional `next`. Generic error "Invalid email or password" for bad credentials or inactive user. On success `startSession` then `redirect(next starting with "/" ? next : "/dashboard")`.
- `registerAction(prev: FormState, formData: FormData): Promise<FormState>` — fields `name`, `email`, `password`, `confirm_password`. Domain check (§1), duplicate email → fieldErrors.email. First user becomes admin. Return `values` (name, email) on error so the form stays filled. Redirect `/dashboard` on success.
- `logoutAction(): Promise<void>` — `endSession()` then `redirect("/login")`.

`src/actions/projects.ts` (all return `ActionResult`, all log activity on the project and, for sub-project creation, also `subproject_created` on the parent):
- `createProjectAction(input: CreateProjectInput): Promise<ActionResult<{ id: string }>>`
- `updateProjectAction(id: string, input: UpdateProjectInput): Promise<ActionResult<Project>>` — logs `status_changed` with a message like `changed status from Ongoing to Completed` when status changes, otherwise `project_updated`.
- `updateProjectStatusAction(id: string, status: ProjectStatus): Promise<ActionResult<Project>>`
- `updateProjectProgressAction(id: string, progress: number): Promise<ActionResult<Project>>`
- `deleteProjectAction(id: string): Promise<ActionResult<{ parent_id: string | null }>>` — permission via `canDeleteProject`; logs `project_deleted` on the parent (or project_id null for top-level).
- `setProjectMembersAction(id: string, userIds: string[]): Promise<ActionResult<UserSummary[]>>` — logs member_added/removed per diff.
- `reorderProjectsAction(parentId: string | null, orderedIds: string[]): Promise<ActionResult>`

`src/actions/comments.ts`
- `addCommentAction(projectId: string, body: string): Promise<ActionResult<Comment>>` (logs `comment_added`)
- `deleteCommentAction(id: string): Promise<ActionResult>` — author or admin only.

`src/actions/users.ts`
- `createUserAction(input: { name: string; email: string; password: string; role: Role; job_title?: string | null }): Promise<ActionResult<User>>` — admin only.
- `updateUserRoleAction(id: string, role: Role): Promise<ActionResult<User>>` — admin; refuse to demote the last active admin.
- `setUserActiveAction(id: string, active: boolean): Promise<ActionResult<User>>` — admin; cannot deactivate yourself; deactivating deletes that user's sessions.
- `resetUserPasswordAction(id: string, newPassword: string): Promise<ActionResult>` — admin; deletes that user's sessions.
- `updateProfileAction(input: { name: string; job_title?: string | null; color: string }): Promise<ActionResult<User>>`
- `changePasswordAction(input: { current_password: string; new_password: string }): Promise<ActionResult>` — verifies the current password.

## 8. Validation (`src/lib/validation.ts`, zod v4)

Export: `projectInputSchema` (name 1–120 trimmed; description ≤ 5000; status/priority enums from `PROJECT_STATUSES`/`PRIORITIES`; `owner_id` string|null; `start_date`/`due_date` `"YYYY-MM-DD"`|null with `""`→null and due ≥ start when both set; `progress` int 0–100; `color` `#rrggbb`|null; `parent_id` string|null; `member_ids` string[]), `updateProjectSchema = projectInputSchema.partial()`, `loginSchema`, `registerSchema` (password ≥ `MIN_PASSWORD_LENGTH`, confirm must match), `createUserSchema`, `profileSchema`, `changePasswordSchema`, `commentSchema` (body 1–4000 trimmed), `emailSchema`. Also `fieldErrorsFromIssues(issues: z.ZodIssue[]): Record<string, string>` built by iterating `issues` (first issue per path) — do not rely on `.flatten()`. Use `z.email()` for email fields.

## 9. UI kit (`src/components/ui/*`) — exact exports

**[v2: the design agent restyles every primitive to Aurora Grid (§23.5) without changing these exports, and adds the primitives in §20.1.]**

All primitives accept `className` and forward refs where they wrap native elements. Styling uses the tokens in §10 (`bg-surface`, `border-border`, `text-fg`, `text-fg-muted`, `bg-accent`, `text-accent-fg`, …); dark mode is handled by the tokens, not by per-usage `dark:` classes (except status/priority tones).

- `button.tsx`: `type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger"`, `type ButtonSize = "sm" | "md" | "lg" | "icon"`, `buttonVariants({ variant?, size?, className? }): string`, `Button` (forwardRef; props `variant`, `size`, `loading?: boolean` → shows `<Spinner>` and disables, plus native button props; `type` defaults to `"button"`). Renders `data-size={size}`; on coarse pointers an invisible `::after` grows the hit area to at least 40x40px without changing the look.
- `input.tsx`: `Input`, `Textarea` (both forwardRef, prop `invalid?: boolean` adds the danger ring). `CONTROL_CLASS` (shared with `NativeSelect`) uses 16px text below `sm` (stops iOS zoom on focus) and 14px from `sm`; do not override it with `text-sm`.
- `label.tsx`: `Label`. `form-field.tsx`: `FormField({ label, htmlFor, error?, hint?, required?, children, className? })` — renders label, control, hint and error (`role="alert"`, danger colour).
- `native-select.tsx`: `NativeSelect` (forwardRef `<select>`, `invalid?`, chevron icon overlay). `checkbox.tsx`: `Checkbox` (styled native checkbox, forwardRef).
- `dialog.tsx` (radix `Dialog`): re-export `Dialog`, `DialogTrigger`, `DialogClose`; `DialogContent({ title, description?, children, className?, size?: "sm" | "md" | "lg" })` renders Portal, Overlay (blur + fade), Content, header with `Dialog.Title`/`Dialog.Description` and a close X button (aria-label "Close"), and a scrolling body. Below `sm` the Content is a full-width bottom sheet (`max-h-[85dvh]`, slides up, safe-area padded); from `sm` a centred modal (`inset-0 m-auto h-fit`, `max-h-[90dvh]`, scale/fade) — never centre fixed boxes with `left-1/2 -translate-x-1/2`. `DialogFooter` must be the last element of the body (or of a form inside it): it sticks to the bottom of the scrolling body, stacks full-width buttons (primary on top) on phones and is a right-aligned row from `sm`. Dialog bodies are single-column on phones (`sm:grid-cols-2` at most).
- `dropdown-menu.tsx` (radix `DropdownMenu`): re-export `DropdownMenu`, `DropdownMenuTrigger`; `DropdownMenuContent({ children, align?, sideOffset?, className? })` (Portal + styled, capped to the available viewport space and scrolling; items are 40px tall on coarse pointers); `DropdownMenuItem({ children, onSelect?, destructive?, disabled?, className?, asChild? })`; `DropdownMenuSeparator`; `DropdownMenuLabel`; `DropdownMenuCheckboxItem({ checked, onCheckedChange, children })`.
- `popover.tsx`: `Popover`, `PopoverTrigger`, `PopoverContent({ children, align?, className? })`.
- `tooltip.tsx`: `TooltipProvider` (mount once in root layout), `Tooltip({ content, children, side? })` (`children` is a single element; uses `asChild`).
- `badge.tsx`: `Badge({ tone?: BadgeTone, dot?: boolean, children, className? })` with light/dark classes per tone, e.g. blue → `bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/30`.
- `avatar.tsx`: `UserAvatar({ user: { name: string; color: string }, size?: "xs" | "sm" | "md" | "lg", className? })` (initials on `user.color`), `AvatarStack({ users: { id: string; name: string; color: string }[], max?: number, size? })` (overlapping, "+N" overflow, tooltip with names).
- `card.tsx`: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- `empty-state.tsx`: `EmptyState({ icon?: LucideIcon, title, description?, action?: ReactNode, className? })`.
- `progress.tsx`: `ProgressBar({ value, size?: "sm" | "md", showLabel?, className? })` — accent bar, green at 100, `role="progressbar"` with aria attributes.
- `confirm-dialog.tsx` (`"use client"`): `ConfirmDialog({ trigger, title, description?, confirmLabel?, cancelLabel?, destructive?, onConfirm: () => Promise<unknown> | unknown })` — manages open and pending state; closes after `onConfirm` resolves.
- `page-header.tsx`: `PageHeader({ title, description?, actions?, breadcrumbs?: { label: string; href?: string }[], className? })`. `description` renders in a `<div>` (it may hold badges/selects). Below `sm` the actions are a full-width row under the title (children grow, except `data-size="icon"` buttons); from `sm` they sit to the right.
- `time-ago.tsx` (`"use client"`): `TimeAgo({ date, className? })` — renders `formatDate(date)` initially and switches to `relativeTime(date)` after mount; `title` = `formatDateTime(date)`; refreshes every 60s.
- `spinner.tsx`: `Spinner({ className?, size?: "sm" | "md" })`. `skeleton.tsx`: `Skeleton({ className })`.
- `segmented-control.tsx` (`"use client"`): `SegmentedControl<T extends string>({ value, onChange, options: { value: T; label: string; icon?: LucideIcon }[], ariaLabel, className? })` — `role="radiogroup"`.
- `toaster.tsx` (`"use client"`): `Toaster` wrapping sonner's Toaster (top-right, `richColors`, theme following `.dark`). Elsewhere use `import { toast } from "sonner"`.
- `src/components/projects/status-badge.tsx`: `StatusBadge({ status, className? })` (Badge with dot, label from STATUS_CONFIG). `priority-badge.tsx`: `PriorityBadge({ priority, iconOnly?, className? })` (lucide: low `ArrowDown`, medium `Minus`, high `ArrowUp`, urgent `AlertTriangle`; colour from `PRIORITY_CONFIG.iconClass`). `due-date.tsx`: `DueDate({ date, status, className?, withIcon? })` — "—" when null, red + "Overdue" tooltip when `isOverdue`, amber when due within 3 days, muted otherwise. **[v2: optional `today` and `closed` switch it to workspace-time `isOverdueOn`/`daysUntilOn` (§20.2).]**

## 10. App shell and theming

**[v2: token values, fonts (Inter replaces Geist Sans; Geist Mono stays), glass chrome, aurora background and motion are superseded by §23.5. The sidebar moves from `NAV_ITEMS` (kept, deprecated) to the grouped, data-driven `NAV_CONFIG`/`NAV_GROUPS`/`navSections()` (§19). The shell gains three slots: topbar actions, sidebar extras and global overlays (§20.3).]**

`src/app/globals.css` defines tokens on `:root` and `.dark`, mapped via `@theme inline` so Tailwind utilities exist: `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-border-strong`, `--color-fg`, `--color-fg-muted`, `--color-fg-subtle`, `--color-accent`, `--color-accent-hover`, `--color-accent-fg`, `--color-accent-soft`, `--color-danger`, `--color-success`, `--color-warning`, `--font-sans` (Geist), `--font-mono`. Light: bg `#f6f6f8`, surface `#ffffff`, surface-2 `#f1f1f4`, border `#e6e6eb`, border-strong `#d2d2da`, fg `#1a1a21`, fg-muted `#6b6b78`, fg-subtle `#9a9aa6`, accent `#5b5bd6`, accent-hover `#4a4ac4`, accent-fg `#ffffff`, accent-soft `#ececfb`, danger `#e5484d`, success `#30a46c`, warning `#e8a317`. Dark: bg `#0e0e11`, surface `#16161a`, surface-2 `#1d1d22`, border `#27272e`, border-strong `#363640`, fg `#ededf0`, fg-muted `#9b9ba7`, fg-subtle `#6c6c78`, accent `#8484f5`, accent-hover `#9c9cf7`, accent-fg `#0e0e11`, accent-soft `#24244d`, danger `#ff6369`, success `#3dd68c`, warning `#ffb224`. Add `@custom-variant dark (&:where(.dark, .dark *));`, base styles (`body { @apply bg-bg text-fg antialiased; }`), a thin custom scrollbar, and `::selection` in accent-soft.

Theme: class strategy. `src/components/layout/theme-script.tsx` exports an inline `<script>` that reads `localStorage["prx-theme"]` (`"light" | "dark" | "system"`, default system) and toggles `.dark` on `<html>` before paint. `theme-toggle.tsx` (`"use client"`) sets the theme and persists it. Root `<html>` uses `suppressHydrationWarning`.

Shell: left sidebar (w-64, `bg-surface`, border-right) with the PRX wordmark + "AvlysAI" caption, nav from `NAV_ITEMS` (active state by `usePathname`, lucide icons), and a footer user menu (`UserAvatar`, name, role; dropdown with Settings, theme toggle, Log out via `<form action={logoutAction}>`). On `< lg` the sidebar collapses into a drawer opened from a top bar hamburger (`Sidebar({ user, onNavigate?, headerAction?, className? })`; `headerAction` is the drawer's close button). Main area: `bg-bg`, content container `mx-auto w-full max-w-[120rem] px-4 sm:px-6 lg:px-8 2xl:px-10 pt-6` (plus safe-area insets; the root viewport uses `viewportFit: "cover"`). Pages must not re-cap the container; reading-heavy pages cap themselves (settings: `max-w-5xl`, long text: `max-w-[80ch]`). Breakpoints are Tailwind's plus `3xl` = 120rem (1920px), defined once in `globals.css` as `@theme { --breakpoint-3xl: 120rem; }`. Touch: hover-revealed controls also use `pointer-coarse:opacity-100`; free text uses `[overflow-wrap:anywhere]` and flex/grid children `min-w-0`. Pages start with `<PageHeader>`. Motion: 150ms transitions on hover/focus, dialogs fade/scale 150ms, respect `prefers-reduced-motion`.

## 11. Pages

**[v2: `/dashboard` becomes Home 2.0 (bento, W5 home). `/projects` gains client, service line, engagement type, health and label filters (W2 commercial). `/projects/[id]` becomes a tabbed page driven by the tab registry (§21, W2 delivery). `/settings` becomes a registry of sections (§20.4). New routes: §19.]**

`/login` and `/register` (`(auth)` group): two-column layout on `lg` (brand panel left: PRX wordmark, "AvlysAI", one-line tagline, three short value bullets; form right), single column centred below. Forms use `useActionState` with `loginAction`/`registerAction` and `INITIAL_FORM_STATE`; show field errors under inputs and a top-level error banner; submit button shows pending state; links between login/register. Login reads `?next=` from the URL into a hidden input. Register shows "Only @avlysai.com addresses can register" (domain list from a prop computed server-side) and "The first account created becomes the admin" when `countUsers() === 0`.

`/dashboard`: `PageHeader` "Good morning/afternoon/evening, {first name}" with the date; four stat cards (Total projects, Ongoing, Due this week, Overdue — each with icon and a one-line caption); a "Status overview" card with a horizontal stacked bar + legend per status (counts from `getProjectStats()`); two columns below: "My projects" (`listMyProjects`, `ProjectCard` compact, link to /projects) and "Upcoming deadlines" (`listUpcomingDeadlines(8)`, rows with name, `DueDate`, owner avatar); then "Recent activity" (`listRecentActivity(12)`: avatar, actor name, message, project link, `TimeAgo`). Empty states everywhere with a primary "New project" action.

`/projects`: `PageHeader` "Projects" with description and a primary "New project" button (`ProjectDialog mode="create"`). Toolbar: search input (debounced, updates `?q=`), status filter (multi, dropdown checkbox items), priority filter, owner filter, "Include sub-projects" toggle, sort select, and a `SegmentedControl` for view `board | list` (persisted in `?view=`). All filters live in the URL search params (page is a server component reading `searchParams` — in Next 15 it is a Promise, await it) so links are shareable; a client `ProjectsToolbar({ params, users, resultCount?, className? })` component updates them with `router.replace`. Below `md` the toolbar shows only search, a "Filters" button (sheet with status, priority, owner, sub-projects and sort; `resultCount` labels its confirm button) and the view toggle; from `md` the controls sit inline. Board view (column widths in `board-layout.ts`: one ~85vw snapping column plus jump chips on phones, fluid columns from `md` that all fit from ~1030px of main column): one column per status in `STATUS_ORDER` with count badge, cards via `ProjectCard`, drag-and-drop between columns with `@dnd-kit` (optimistic update, `updateProjectStatusAction`, toast on failure and revert), "+ Add" at the bottom of each column opening `ProjectDialog` with `defaultStatus`. List view: stacked rows below `md`, from `md` a table whose secondary columns appear progressively (name + colour dot + sub-project count pill, status via `StatusSelect`, priority badge, owner avatar+name, members `AvatarStack`, start/due dates, progress bar, updated `TimeAgo`); rows link to the project; sortable by clicking headers (sort param). Results count. Empty state when nothing matches with a "Clear filters" button.

`/projects/[id]`: `notFound()` when missing. Breadcrumbs: Projects › ancestors › current. Header: colour dot + name (h1), `StatusSelect`, `PriorityBadge`, actions: "Add sub-project" (`ProjectDialog mode="create" parentId`), "Edit" (`ProjectDialog mode="edit"`), overflow menu with "Delete" (`ConfirmDialog`, only when `canDeleteProject`; after delete navigate to the parent project or `/projects`). Layout from `./grid.ts` (shared with `loading.tsx`): one column below `xl` in the order Details, main stack, Activity; from `xl` main column + side column (Details above Activity); from `3xl` three columns (main | Details | Activity). Main column: description (pre-wrapped, empty placeholder), "Sub-projects" card with count and completed/total mini progress, a tree (`ProjectTree` client component: expandable rows with indentation guides, status dot/badge, name link, owner avatar, `DueDate`, small progress bar, per-row "+" to add a nested sub-project and a row menu with Edit/Delete), empty state "No sub-projects yet"; "Comments" card (list with avatar, name, `TimeAgo`, body with whitespace preserved, delete for author/admin; composer textarea + "Comment" button, Cmd/Ctrl+Enter submits). Details/Activity: "Details" card (Owner, Members `AvatarStack` + "Manage" popover with checkbox list of users → `setProjectMembersAction`, Start, Due with `DueDate`, Progress with an editable slider/number → `updateProjectProgressAction` on commit, Created by, Created/Updated `TimeAgo`), "Activity" card (timeline of `listProjectActivity(id, 30)`).

`/team`: `PageHeader` "Team" + (admin) "Add member" button → dialog (name, email, job title, role, temporary password; `createUserAction`). Table/cards: avatar, name, email, job title, role badge, active projects count (`getUserProjectCounts`), status (Active/Deactivated), joined date; admin row menu: change role, reset password (dialog), deactivate/reactivate (`ConfirmDialog`). Non-admins see a read-only directory. "You" marker on the current user.

`/settings`: sections (`SettingsSection({ id, title, description?, children, className? })`: heading above its card, beside it from `xl`) in a centred `max-w-5xl` column. "Profile": name, job title, avatar colour picker (swatches from `AVATAR_COLORS`, live preview with `UserAvatar`), save → `updateProfileAction`. "Password": current, new, confirm → `changePasswordAction`. Plus an "Appearance" card with the theme selector (Light / Dark / System via `SegmentedControl`). Inline validation + toasts.

## 12. Shared project components (contracts)

**[v2: `ProjectDialog` keeps these props and gains optional ones (§20.2, commercial): engagement fields, labels, admin-only commercial fields, a `startStep` slot for the template picker, a `detailsAside` slot for the schedule preview and a `createAction` override. `ProjectCard`, `ProjectList` and `ProjectBoard` gain the v2 content and the optional `workspace` prop listed in §20.2.]**

- `src/components/projects/project-dialog.tsx` (`"use client"`): `ProjectDialog({ mode: "create" | "edit"; project?: ProjectWithMeta; parentId?: string | null; parentName?: string | null; users: UserSummary[]; trigger: ReactNode; defaultStatus?: ProjectStatus; onSuccess?: (id: string) => void })`. Fields: name, description, status, priority, owner (NativeSelect of users + "Unassigned"), members (checkbox list in a scrollable box, with avatars), start date, due date (native date inputs), progress (range + number), colour swatches. Client-side checks mirror `projectInputSchema`; server fieldErrors displayed. Calls `createProjectAction` / `updateProjectAction`, toasts, `router.refresh()`, closes, calls `onSuccess`. The dialog title says "New sub-project in {parentName}" when `parentId` is set.
- `src/components/projects/project-card.tsx`: `ProjectCard({ project: ProjectWithMeta; compact?: boolean; className? })` — `Link` to `/projects/{id}`; colour bar/dot, name, parent name (small, when present), description (2 lines clamp, not in compact), `StatusBadge`, `PriorityBadge iconOnly`, `DueDate`, `AvatarStack` of owner+members, sub-project pill ("3/5 sub-projects"), comment count, `ProgressBar sm`.
- `src/components/projects/status-select.tsx` (`"use client"`): `StatusSelect({ projectId, status, size?: "sm" | "md", className? })` — dropdown trigger looks like a `StatusBadge` with a chevron; items list all statuses with dots; calls `updateProjectStatusAction`, optimistic, toast on error, `router.refresh()`.

## 13. No demo data

PRX ships with no demo or sample data and no seed script. A fresh database contains only what the schema bootstrap creates (the `app_settings` row, the `schema_version` row and, on first use, the default label catalogue). The first person to register at `/register` becomes the admin; everyone else registers with an allowed email domain or is added by an admin from the Team page. Built-in engagement templates (`src/lib/templates.ts`) are product configuration, not demo data. Tests use throwaway scripts outside the repo against an in-memory or local PGlite database and delete what they create.

## 14. Definition of done

`npm run typecheck`, `npm run lint` and `npm run build` pass with zero errors. Every page works in light and dark mode, at 375px and 1440px widths, with keyboard only. No console errors or hydration warnings in dev. Every mutation gives feedback (toast or inline) and refreshes data. Empty, loading (pending buttons) and error states exist. No placeholder text, TODOs, or stubbed functions remain.

---

# PRX v2 — AvlysAI delivery model and Aurora Grid

## 15. v2 overview, workflows and ground rules

A PRX project is now a **client engagement**: it belongs to a client, has a service line, an engagement (pricing) type, a currency, an admin-only contract value, delivery phases with deliverables and go/no-go gates, tasks, a success scorecard, a RAID log, weekly RAG status updates, an eval log (AI work), data batches (Avlys Data), time against an hours budget, and a 90-day post-go-live tuning window.

Product defaults (decided): PRX stays internal-only (no client portal or guest role); no sprints; time tracking is optional (margin and capacity, not invoicing); INR and USD are always reported separately (approximate margin converts USD with the admin-set `app_settings.usd_inr_rate`, default 83, and is labelled approximate); commercial data (contract value, hourly rate, phase prices and invoice status, cost rates, margin, the USD-INR rate) is admin-only and enforced server-side; existing projects keep `progress_mode = 'manual'`. The plan's "later" tier (client portal, Slack/GitHub/email, realtime presence, AI assistant, sprints, sales pipeline, change requests / run-cost ledger / dataset register, recurring tasks, timeline drag) is out of scope.

**Libraries added in v2** (pinned exactly; add nothing else): `motion@13.4.4` (import from `motion/react` and `motion/react-m`; never install `framer-motion` directly), `cmdk@1.1.1`, `date-fns@4.4.0`, `recharts@3.10.1` (only on `/reports`, through `next/dynamic`), `react-is@19.1.0` (recharts peer, matches react 19.1.0), `@number-flow/react@0.6.2`, `@vercel/blob@2.8.0` (only when `BLOB_READ_WRITE_TOKEN` is set).

### 15.1 Workflows and roster

Work happens in sequential workflows; agents inside a workflow run in parallel. Every workflow from W2 on ends with an **integration agent** that wires the shared integration points (NAV `enabled` flags, topbar/sidebar/overlay slots, tab/overview/drawer/settings registries, cross-feature `notify()` calls and swaps listed in §22), then gets `npx tsc --noEmit -p tsconfig.json`, `npm run lint` and the PGlite bootstrap (`node scripts/dev-local.mjs npx tsx scripts/migrate.ts`) green.

| Workflow | Agents (parallel), then integration |
|---|---|
| W1 Foundation | `foundation`: libraries, schema, types, constants, helpers, this spec |
| W2 Design + core work model | `design`, `tasks`, `delivery`, `commercial` → `w2-integration` |
| W3 Collaboration + planning | `notifications`, `attachments`, `search`, `calendar`, `timeline` → `w3-integration` |
| W4 AvlysAI delivery layer | `templates`, `scorecard`, `updates-risks`, `evals-batches` → `w4-integration` |
| W5 Time + insight + productivity | `time`, `reports`, `productivity`, `home` → `w5-integration` |
| W6 Polish | `polish`: remove demo data, motion/a11y pass, responsive pass, README, build |

### 15.2 Ground rules for every v2 agent

1. Read this whole file first. Edit only files you own in §22 for your workflow. If you need a change in a file you do not own, finish your part against the contract and put a precise request for your workflow's integration agent in your final report. Never edit it yourself.
2. Never run git write commands, `next dev` or `next build` (W6 runs the build). Never revert the uncommitted responsive-design work in the tree.
3. `src/lib/types.ts`, `src/lib/constants.ts` and the SCHEMA in `src/lib/db.ts` are W1 contracts. After W1 they are append-only and edited only by a workflow's integration agent (NAV `enabled` flips, a missing shared type). Feature agents may export extra module-local types from their own modules. Schema changes after W1 go into a new `SCHEMA_V3` block appended by an integration agent, following the rules in the `SCHEMA_V2` header comment, and **bump `SCHEMA_VERSION` in `db.ts` in the same change** — an already-migrated database skips the bootstrap entirely until the version moves. A constraint on a column that already exists cannot ride on `ADD COLUMN IF NOT EXISTS`; give it its own idempotent statement.
4. No `any`, no `@ts-ignore`, no TODOs, stubs or placeholder code; every export works end to end. Keep every existing export working.
5. Pure-JS packages only (no native/C++ build deps). The data layer (`src/lib/data/*`) and the `src/lib/*` helpers never import `next/*`.
6. **Early exports inside a parallel workflow.** Some files are imported by siblings in the same workflow. Their owners write these complete (never stubbed) before anything else:
   - W2 `design`: `src/components/ui/{tabs,switch,sheet,kbd,rag-dot,money,progress-ring,number-ticker,spotlight-card,icon,user-picker}.tsx`, then `src/components/layout/{topbar-actions,sidebar-extra,global-overlays}.tsx`.
   - W2 `tasks`: `src/lib/data/tasks.ts` (`recomputeProjectProgress`, `listTasks`, `getTask`) and `src/components/tasks/project-tasks-tab.tsx`.
   - W2 `commercial`: `src/lib/data/app-settings.ts` (`getAppSettings`, `getWorkspaceTimezone`, `getWorkspaceToday`), `src/lib/data/labels.ts` (`listLabels`), `src/components/labels/{label-picker,label-chips}.tsx`, `src/components/clients/{client-chip,service-line-badge}.tsx` (`ClientChip`, `ServiceLineBadge`: siblings show the client code and service line with these, never with their own chips).
   - W2 `delivery`: `src/components/projects/detail/tabs/{types,registry}.ts`, `src/components/projects/detail/overview/registry.ts`, `src/lib/data/milestones.ts` (`listMilestones`, `listMilestoneRefs`; tasks needs them for the milestone filter, grouping and pickers) and `src/components/milestones/gate-action-slot.tsx`.
   - Health anywhere (cards, rows, board, timeline labels, client pages, Home) renders design's `RagDot` (`src/components/ui/rag-dot.tsx`), never a bare coloured dot.
   - W3 `notifications`: `src/lib/data/notifications.ts` (`notify`, `autoSubscribe`) and `src/components/notifications/mention-textarea.tsx`.
   If a sibling's early export is not on disk yet, code against this spec; the integration agent verifies the combined build.
7. Zod schemas for v2 live in `src/lib/schemas/<area>.ts`, one file per owning agent. `src/lib/validation.ts` keeps the v1 schemas and `fieldErrorsFromIssues` (reuse it). Only W2 `commercial` edits `validation.ts` (to extend the project schemas).
8. Reads that client components need on demand (drawer details, picker options) are server actions returning `ActionResult<T>` (names end in `Action`), never API routes. Route handlers exist only for file upload and CSV export (§19).

## 16. Data model v2 (summary of `SCHEMA_V2` in `src/lib/db.ts`)

Conventions are v1's (TEXT ids, timestamps and dates; BOOLEAN; JSONB; counts cast `::int`) plus: money is `INTEGER` whole units of the row's currency; durations are integer minutes; enum CHECK lists equal the `as const` arrays in `types.ts`; every FK has an explicit ON DELETE; FK and filter columns are indexed; prefix search uses the `lower(col) text_pattern_ops` indexes on `projects.name`, `tasks.title` and `clients.name` together with `likePrefix()`.

- **Integer bounds.** Every `INTEGER` column (money, `budget_hours`, `estimate_minutes`, `units_*`, ...) tops out at `MAX_DB_INT` (2,147,483,647); a larger value fails with 22003, which surfaces as a generic error. Zod schemas therefore cap every integer input: money `z.number().int().min(0).max(MAX_MONEY)`, other integers `.int().min(0).max(MAX_DB_INT)` or the lower business cap that mirrors the DB CHECK (`MAX_TUNING_DAYS` 730, `MAX_WEEKLY_CAPACITY_HOURS` 168, `MIN_UPDATE_CADENCE_DAYS`..`MAX_UPDATE_CADENCE_DAYS` 1-60, `MAX_ENTRY_MINUTES` 1440).
- **Aggregates.** Cast every aggregate in SQL: counts and minute sums `::int`; money sums and ratios `::float8` (exact to 2^53); never return a raw `SUM`/`AVG`/`ROUND` (node-postgres returns bigint and numeric as strings, but `types.ts` declares numbers).
- **Rates are fractions 0-1 everywhere** (`success_metrics` baseline/target/current, `eval_runs.metrics`, `data_batches.gold_accuracy`/`quality_threshold`, `METRIC_PRESETS`, template metrics). `unit: "%"` is display-only (value × 100, at most one decimal) via `formatMetricValue(value, unit)`. Eval-run metric names must equal scorecard names: the Log run dialog autocompletes from `listMetricNames`, matching is case-insensitive.
- **Currency travels with amounts.** `projects.contract_value` and `hourly_rate` require `projects.currency` (DB CHECKs `projects_contract_value_currency_check` / `projects_hourly_rate_currency_check`); `milestones.price` is in the project's currency, so the data layer rejects a phase price while the project has no currency, and rejects changing or clearing a project's currency while any amount is set (§17.3, §17.4).

| Table / change | Key columns and rules |
|---|---|
| `task_number_seq` | Global sequence for `tasks.number`, `OWNED BY tasks.number` (so `TRUNCATE ... RESTART IDENTITY` restarts it). The display key `PRX-{number}` (`taskKey()`) is never stored. Never insert explicit numbers. |
| `clients` | `code` UNIQUE with CHECK `^[A-Z][A-Z0-9]{1,5}$` (`CLIENT_CODE_PATTERN`); `region` india/international; `currency` INR/USD (default for new engagements); `systems` JSONB array; `nda_signed`, `dpa_signed`, `confidential`; `color`; `archived_at`; `created_by` → users SET NULL. |
| `app_settings` | One row, `id = 1` (CHECK), inserted by the bootstrap (and re-inserted by `getAppSettings` when missing). `workspace_timezone` ('Asia/Kolkata'), `usd_inr_rate` (83, admin-only), `default_tuning_days` (90; `createProject` uses it when no template gives `tuning_days`), `update_cadence_days` (7), `labels_seeded_at`, `updated_by` (no FK on purpose, so `TRUNCATE users CASCADE` cannot delete the row), `updated_at`. |
| `schema_version` | One row, `id = 1`: the `SCHEMA_VERSION` the database was last migrated to. Written only by `runSchemaBootstrap`; no FK, so a `TRUNCATE ... CASCADE` leaves it alone. |
| `projects` + | `client_id` → clients SET NULL; `service_line`; `engagement_type` (fixed_price / retainer / time_and_materials / internal); `currency`; `contract_value`, `hourly_rate` (admin-only; each requires `currency`, DB CHECK); `delivery_state` ('not_started'); `progress_mode` ('manual' default, so existing rows stay manual; new projects get `DEFAULT_NEW_PROJECT_PROGRESS_MODE` = 'tasks' from the action or the template); `budget_hours`, `budget_period` (total/monthly); `health`, `health_updated_at` (denormalised from the latest status update); `go_live_date` (written only by `setGoLiveDate`), `tuning_days` (column default 90 for legacy rows; new projects get the template's value or `app_settings.default_tuning_days`), `tuning_closed_at`; `template_key` ("builtin:<key>" / "custom:<uuid>"); `source_project_id` → projects SET NULL. |
| `users` + | `weekly_capacity_hours` (40); `cost_rate` (INR per hour, admin-only, never selected into `User`). |
| `milestones` | `kind` phase/milestone; `phase_key` (template key such as 'audit', 'pilot', 'scale'); `position`; dates; `status` planned/active/gate_review/done/stopped; gate fields (`requires_gate`, `gate_decision`, `gate_decided_by` → users SET NULL, `gate_decided_at`, `gate_notes`, `extend_count`, `client_signoff_name`/`_date`, `evidence_url`); `price` (admin-only, in the project's currency; rejected while the project has no currency) and `invoice_status` (admin-only); `completed_at`. Deliverables are tasks with `is_deliverable` and that `milestone_id`; the handover checklist is the deliverables of the `phase_key = 'scale'` phase (one deliverable per item). Gate history is the `gate_requested`/`gate_decided` activity entries whose `meta.milestone_id` is the phase (`GateRequestedMeta`, `GateDecidedMeta`; read with `listGateHistory`). |
| `tasks` | `number` UNIQUE DEFAULT nextval; `project_id` CASCADE; `milestone_id` SET NULL; `parent_task_id` CASCADE (one level only); `status` todo/in_progress/in_review/done/cancelled; `priority`; `assignee_id` SET NULL; `start_date`, `due_date`; `estimate_minutes`; `is_deliverable`, `approved_by_name`, `approved_on` (date); `position` DOUBLE PRECISION (fractional, per status column); `created_by` (the reporter) → users; `completed_at`. |
| `task_checklist_items` | `task_id` CASCADE, `title`, `done`, `position` INTEGER, `completed_at`. |
| `task_dependencies` | PK (`task_id`, `blocked_by_id`), both CASCADE, CHECK not self. Reads "task_id is blocked by blocked_by_id". |
| `comments` + / `activity` + | `comments.task_id` → tasks CASCADE (task comments keep `project_id` = the task's project). `activity.task_id` TEXT without FK (a `task_deleted` entry keeps it). |
| `labels`, `project_labels`, `task_labels` | `labels.name` unique on `lower(name)`; `label_group` tech/domain/general; join tables have PK (entity, label), both CASCADE. `DEFAULT_LABELS` are inserted once by `ensureDefaultLabels()`, never by the bootstrap (so deleted labels stay deleted). |
| `subscriptions` | Watchers. Exactly one of `project_id`/`task_id` (CHECK), both CASCADE; UNIQUE (user_id, project_id) and (user_id, task_id); `muted` = explicit Unwatch, which auto-subscribe never clears. |
| `notifications` | `type` in `NOTIFICATION_TYPES`; `actor_id` SET NULL; `project_id`/`task_id`/`comment_id` CASCADE; `title`, `body`, `url`; `dedupe_key` with a partial UNIQUE (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL, so insert with `ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`; `read_at`. |
| `attachments` | `kind` link/file (CHECK: file needs `blob_pathname`); `link_type`; `pinned` (overview Key links); `mime_type`, `size_bytes`; `project_id` CASCADE, `task_id`/`comment_id` CASCADE; `uploaded_by` SET NULL. |
| `time_entries` | `user_id` → users RESTRICT; `project_id` CASCADE; `task_id`/`milestone_id` SET NULL; `entry_date`; `minutes` 1-1440; `billable`; `note`; `source` manual/timer/timesheet. Partial UNIQUE `uq_time_entries_timesheet_cell` on (user_id, project_id, `COALESCE(task_id, '')`, entry_date) WHERE source = 'timesheet': one timesheet row per cell (manual/timer rows in the same cell are unaffected). |
| `timers` | Running while `stopped_at IS NULL`; partial UNIQUE (user_id) WHERE stopped_at IS NULL (one running timer per user); `time_entry_id` → time_entries SET NULL (set on stop, which enables Undo); stopped rows are pruned after `STOPPED_TIMER_RETENTION_DAYS`. |
| `project_templates` | Custom templates: `payload` JSONB object (`TemplatePayload`), `service_line`, `source_project_id`, `created_by`. Built-ins live in `src/lib/templates.ts`. |
| `success_metrics` | `direction` higher/lower, `baseline`, `target` (required), `current`, `current_measured_at`, `locked_at`, `position`, `notes`. UNIQUE (project_id, `lower(name)`). Rates are fractions 0-1. Met = `metricIsMet()`. |
| `status_updates` | `week_of` (Monday in the workspace timezone), `health` plus optional `schedule_rag`/`budget_rag`/`scope_rag`/`quality_rag`, `headline` 1-140 chars, `done`, `next`, `blockers`, `client_asks`, `internal_notes`, `changes` JSONB object (`StatusUpdateChanges`), `metrics_snapshot` JSONB array (`MetricSnapshot[]`). |
| `risks` | RAID log. `kind` risk/assumption/issue/dependency/decision; `category` in `RISK_CATEGORIES`; `likelihood`/`impact` 1-5; `owner_id` SET NULL; `mitigation`; `status` open/mitigating/accepted/closed; `review_date`; `due_date` (confirm-by); `closed_at`. Score = `riskScore()`, severity = `riskSeverity()` (≥ 15 red, ≥ 8 amber). |
| `eval_runs` | `change_type`, `model_name`, `prompt_version`, `dataset_version`, `metrics` JSONB object (name → number), `verdict` baseline/candidate/champion/rejected/archived with a partial UNIQUE (project_id) WHERE verdict = 'champion'; `external_url`; `milestone_id` SET NULL. |
| `data_batches` | UNIQUE (project_id, number); `is_calibration`; `unit_type`; `units_target` > 0, `units_delivered`, `units_accepted`; `guideline_version`; `gold_accuracy` 0-1, `agreement_metric`/`agreement_score`, `quality_threshold` 0-1, `agreement_threshold`; `status`; `due_date`, `delivered_at`, `accepted_at`. |
| `saved_views` | `user_id` CASCADE; `scope` in `SAVED_VIEW_SCOPES`; `filters` JSONB object (`SavedViewFilters` = the page's URL params, at most `MAX_SAVED_VIEW_FILTERS_LENGTH` chars serialised, re-validated on load); `is_shared`; `position`. |
| `favorites` | PK (user_id, project_id), both CASCADE; `position`. |

**Derived values (one definition each; use the helpers).** Task key: `taskKey(n)` / `parseTaskKey(s)`. Project progress by mode: `tasks` = done ÷ non-cancelled tasks at every depth (0 without tasks); `milestones` = done phases ÷ phases excluding stopped (kind 'phase' only, 0 without phases); `batches` = `round(100 × Σ units_accepted ÷ Σ units_target)` capped at 100; `manual` = untouched. Milestone progress = done ÷ non-cancelled tasks with that `milestone_id` (100 once the milestone is done). Tuning end = `tuningEndDate(go_live_date, tuning_days)`; days left = end − workspace today (0 on the closing day). Budget burn = `computeBudgetBurn()` over the minutes inside `budgetPeriodRange()`; budget RAG suggestion = `suggestBudgetRag()`. Risk score and severity = `riskScore()` / `riskSeverity()`. Metric met and progress = `metricIsMet()` / `metricProgress()`. Handover progress = non-cancelled deliverables of the `scale` phase (done ÷ total). "Update due" = `isUpdateDue(project, today, cadenceDays, timeZone)`: an `ongoing` project whose `health_updated_at` (else `created_at`), as a workspace date (`dateInTimeZone`), is on or before `addDaysISO(today, -cadenceDays)`; SQL implementations of stale/update-due checks use exactly this rule.

**Bootstrap rules.** `runSchemaBootstrap` reads `schema_version` first. When it is at `SCHEMA_VERSION` (every normal cold start) it runs no DDL at all — two cheap SELECTs, no transaction, no table locks — so it can never block the session lookup or deadlock with writes. Otherwise it opens one transaction, takes the advisory lock (waiting only for another instance's migration), sets `lock_timeout = '5s'`, re-checks the version, runs `SCHEMA` and upserts `schema_version` (`GREATEST`). A lock timeout fails that bootstrap; failures are not cached, so the next request retries. Consequences: (1) bump `SCHEMA_VERSION` with every appended or changed block (§15.2 rule 3); (2) every block stays idempotent, because a bump re-runs all of them; (3) still never add data-dependent statements (UPDATE/DELETE backfills). Legacy databases migrate in place; this was verified on the v1 demo database (rows intact, new columns at their defaults), on a fresh database and on the already-migrated local database, twice each.

### 16.1 Shared helpers added in W1 (pure, safe on server and client)

- `src/lib/money.ts`: `formatMoney(amount, currency, { compact?, withCode? })` (en-IN grouping for INR, en-US for USD, no decimals; "—" for null; deterministic output, never Intl compact notation: INR compact is full below 1L, then "₹12.3L", then "₹2.5Cr" / "₹10,000Cr"; USD compact is full below 1,000, then K / M / B; trailing ".0" trimmed; negatives get a leading "-"), `formatMoneyCompact`, `emptyTotals()`, `sumByCurrency(items)`, `addTotals`, `currenciesWithValue`, `formatTotals(totals)` ("₹15,00,000 · $45,000"), `toInr(amount, currency, rate)` (approximate margin only), `parseMoneyInput("1.5L" | "12,00,000" | "$45,000" | "5000 INR")` (null when invalid, negative or above `MAX_MONEY`), `isCurrency`, `currencySymbol`.
- `src/lib/duration.ts`: `parseDuration("1h 30m" | "1.5" | "90m" | "1:30")` → minutes or null (a bare number means hours), `formatMinutes(90)` → "1h 30m", `formatMinutesClock` → "1:30", `minutesToHours`, `formatHours` → "1.5h", `formatElapsed(ms)` → "04:05" / "1:04:05", `minutesBetween(startIso, endIso)`.
- `src/lib/workspace-time.ts`: `workspaceToday(timeZone, now?)`, `workspaceHour`, `dateInTimeZone(instant, tz)`, `isValidTimeZone`, `safeTimeZone`, `isDateOnly`, `addDaysISO`, `diffDaysISO`, `daysUntilOn(date, today)`, `isOverdueOn(due, today, closed?)`, `isDueWithin(due, today, days)`, `weekdayIndex` (0 = Monday), `isWeekendISO`, `startOfWeekISO` (Monday), `weekDaysISO`, `isoWeekKey` ("2026-W41"), `startOfMonthISO`, `endOfMonthISO`, `eachDayISO`, `weekStartsBetween`, `workingDaysBetween`, `tuningEndDate`.
- `src/lib/templates.ts`: `BUILTIN_TEMPLATES` (ai_delivery, ai_readiness, avlys_data, retainer, custom_software), `BUILTIN_TEMPLATE_KEYS`, `BUILTIN_TEMPLATE_OPTIONS`, `getBuiltinTemplate`, `isBuiltinTemplateKey`, `templateKeyFor(source, id)`, `parseTemplateKey`, `templateBuildDays`, `templateDurationLabel` ("~9 weeks + 90-day tuning"), `computeTemplateSchedule(payload, startDate)` (exact milestone/task dates, shared by the dialog preview and `applyTemplate`), `scheduleLengthDays`, `builtinTemplateOption`, `customTemplateOption`; types `TemplateDefinition`, `TemplateOption`, `BuiltinTemplateKey`, `ScheduledTemplate*`.
- `src/lib/utils.ts` (additions): `clamp`, `taskKey`, `parseTaskKey`, `riskScore`, `riskSeverity`, `metricIsMet`, `metricProgress`, mentions (`mentionToken`, `parseMentions`, `splitMentions`, `mentionsToPlainText`; format `@[Name](user:<uuid>)`, `MENTION_PATTERN_SOURCE`), `likeContains`, `likePrefix`, `buildQueryString`, `isHttpUrl`, `detectLinkType`, `positionBetween`, `needsRebalance`, `toCsv` (RFC 4180, neutralises formula injection), `budgetPeriodRange`, `computeBudgetBurn`, `suggestBudgetRag`, `isUpdateDue`, `formatMetricValue(value, unit)` ("%" shows a 0-1 fraction × 100), `dispatchAppCommand`, `subscribeAppCommands`.
- `src/lib/constants.ts` (additions): config maps with label + description + tone + icon + order for task statuses, service lines, engagement types, delivery states, progress modes, currencies, client regions, RAG, milestone kinds/statuses, gate decisions, invoice statuses, label groups, notification types, link types, metric directions, risk kinds/categories/statuses, eval change types/verdicts, batch unit types/statuses, agreement metrics, saved-view scopes and project tabs; `ICON_NAMES`/`IconName`; `DEFAULT_LABELS`; `METRIC_PRESETS`; `NAV_GROUPS`, `NAV_CONFIG`, `navSections(isAdmin)`; `SHORTCUTS`; `STORAGE_KEYS`; `MOTION`; numeric limits (`MAX_BULK_IDS`, `NOTIFICATION_POLL_MS`, `MAX_UPLOAD_BYTES`, `RISK_SCORE_RED`, `TUNING_ALERT_DAYS`, `TASK_DETAIL_ACTIVITY_LIMIT`, ...); DB bounds (`MAX_DB_INT`, `MAX_MONEY`, `MAX_TUNING_DAYS`, `MAX_WEEKLY_CAPACITY_HOURS`, `MIN_UPDATE_CADENCE_DAYS`, `MAX_UPDATE_CADENCE_DAYS`); `NO_GO_LIVE_SERVICE_LINES`. `NAV_ITEMS` is kept (label "Home") but deprecated.

## 17. Data layer API v2 (`src/lib/data/*.ts`) — exact exports

Same rules as §5: async, parameterised SQL, multi-statement writes in `transaction()`, types from `types.ts`, no `next/*`. Signatures show the resolved type of the returned Promise. `Queryable` is from `@/lib/db`; every function with a trailing `q?: Queryable` runs on that connection when given (so it can join the caller's transaction) and on `db` otherwise. Functions that need "today" take `today: string` (workspace timezone, from `getWorkspaceToday()`); they never call `new Date()` for date-only logic. Functions marked **ADMIN-ONLY** may only be called after the caller has checked `user.role === "admin"`; `options.includeCommercial` must be `user.role === "admin"`, never a client-supplied value.

**Write functions strip like reads.** Every data function that returns a `Project`, `ProjectWithMeta`, `Milestone`, `MilestoneWithMeta` or `AppSettings` — writes included — takes a trailing `options?: ProjectQueryOptions` and returns `contract_value`/`hourly_rate`/`price`/`invoice_status`/`usd_inr_rate` as `null` unless `includeCommercial` (signatures below). Actions pass `{ includeCommercial: user.role === "admin" }`.

**Transactions.** Inside `transaction(tx => …)` every statement and every cross-module call runs on `tx`. Never call `db.*`, `transaction()` or a data function without a `q` parameter while holding a transaction: with PGlite (pool of 1) the inner call times out after 10 s ("timeout exceeded when trying to connect"); on Neon it breaks atomicity and can block on rows the outer transaction holds. Read what you need first (`getAppSettings`, `getWorkspaceToday`, `listLabels`, …), then open the transaction. A function that normally opens its own transaction and is given `q` runs its statements on `q` without a nested `BEGIN`.

**Blob cleanup on cascades.** Deleting a project (whole subtree), a task (with its subtasks), a comment, or tasks in bulk cascades to `attachments` rows. Each of these data functions first runs `SELECT url FROM attachments WHERE kind = 'file' AND (…the rows about to cascade…)` in the same transaction and returns the URLs as `blob_urls`; the action calls `deleteBlobs(blob_urls)` (§17.5) after the commit. Blob failures are logged, never fatal.

### 17.1 Already done in W1 (existing modules, conformance edits)

- `users.ts`: `User.weekly_capacity_hours` is hydrated everywhere; `cost_rate` is never selected.
- `comments.ts`: `Comment.task_id` hydrated; `listComments(projectId)` returns project-level comments only (`task_id IS NULL`).
- `activity.ts`: `Activity.task_id`, `task_key`, `task_title` hydrated (LEFT JOIN tasks); `logActivity(input)` accepts `task_id?: string | null`.
- `projects.ts` (read side): every query selects the v2 columns; `ProjectWithMeta` adds `client`, `labels`, `current_phase`, `task_count`, `task_done_count`, and `comment_count` counts project-level comments only. `listProjects(filters?, options?)`, `getProject(id, options?)`, `getSubprojectTree(id, options?)`, `listUpcomingDeadlines(limit?, options?)`, `listMyProjects(userId, limit?, options?)` take `options: ProjectQueryOptions`; `contract_value`/`hourly_rate` are `null` unless `includeCommercial`. New `ProjectFilters` (`clientId`, `serviceLine`, `engagementType`, `deliveryState`, `health`, `labelIds` any-of, `ids`) are implemented. `createProject(input, createdBy, options?)` and `updateProject(id, patch, options?)` return stripped rows unless `includeCommercial`, but still accept only the v1 inputs (W2 commercial widens them, below).

### 17.2 W2 `tasks`

`src/lib/data/tasks.ts` (new)
- `recomputeProjectProgress(projectId: string, q?: Queryable): number | null` — computes progress for the project's `progress_mode` (§16 derived values) and writes `projects.progress` (does not bump `updated_at`); returns the new value, or `null` for `manual` (no write). Call it in the same transaction after any write that changes tasks, phases or batches.
- `listTasks(filters?: TaskFilters): TaskWithMeta[]` — default sort `position` (then `number`); `due_date` sort puts nulls last; `priority` sort urgent→low then position; search matches title/description (ILIKE via `likeContains`) or an exact `parseTaskKey()` number. Hydration: assignee, project summary (with client code), milestone ref, labels (one grouped query), checklist/subtask/comment/attachment counts, `is_blocked`, `logged_minutes` — no per-row queries.
- `listMyTasks(userId: string, scope: "assigned" | "created", today: string, filters?: MyTaskFilters): Record<MyTaskGroup, TaskWithMeta[]>` — open tasks (`OPEN_TASK_STATUSES`) grouped: overdue (due < today), today, this_week (today+1 .. end of the ISO week), later, no_date; `filters` narrows by labels (any-of) and project. `userId` may be any user: `/tasks?assignee=<id>` calls `listMyTasks(assigneeId, "assigned", today, filters)` (§19.1).
- `getTask(id: string): TaskWithMeta | null`, `getTaskByNumber(number: number): TaskWithMeta | null`, `getTaskByKey(key: string): TaskWithMeta | null` (via `parseTaskKey`).
- `getTaskDetail(id: string): TaskDetail | null` — adds creator, parent, checklist (by position), subtasks, `blocked_by`, `blocking` and `activity` (the latest `TASK_DETAIL_ACTIVITY_LIMIT` entries from `listTaskActivity`, newest first; the drawer's activity section renders it).
- `createTask(input: CreateTaskInput, createdBy: string): TaskWithMeta` — validates that `milestone_id` belongs to the project and that `parent_task_id` is a top-level task of the same project (throws `Error` with a user-facing message otherwise); position = end of its status column (`positionBetween(last, null)`); inserts labels and checklist; sets `completed_at` when created as done; calls `recomputeProjectProgress` in the transaction.
- `updateTask(id: string, patch: UpdateTaskInput): TaskWithMeta` — only provided keys; status change maintains `completed_at` and moves the task to the end of the new column; `label_ids` replaces the set; recomputes progress when status changes.
- `moveTask(id: string, input: MoveTaskInput): TaskWithMeta` — new status + fractional position between `before_id`/`after_id` (`positionBetween`); when `needsRebalance` is true, rewrites that column's positions to multiples of `TASK_POSITION_STEP` first; recomputes progress when status changed.
- `deleteTask(id: string): { project_id: string; number: number; title: string; blob_urls: string[] }` — recomputes progress; `blob_urls` = file attachments of the task, its subtasks and their comments (§17 blob cleanup).
- `setTaskLabels(taskId: string, labelIds: string[]): LabelSummary[]`.
- `addChecklistItem(taskId: string, title: string): TaskChecklistItem`, `updateChecklistItem(id: string, patch: { title?: string; done?: boolean }): TaskChecklistItem` (maintains `completed_at`), `deleteChecklistItem(id: string): { task_id: string }`, `reorderChecklist(taskId: string, orderedIds: string[]): void`.
- `setBlockedBy(taskId: string, blockedByIds: string[], userId: string): TaskRef[]` — replaces the blocker set; rejects self-dependencies and cycles (direct or transitive, recursive CTE) with a user-facing `Error`.
- `listTasksBlockedBy(taskId: string): TaskRef[]` — tasks that list `taskId` as a blocker (for "blocker cleared" notifications).
- `bulkUpdateTasks(ids: string[], patch: BulkTaskPatch): BulkResult` — at most `MAX_BULK_IDS`; one transaction; progress recomputed once per touched project. Fills every `BulkResult` field: `per_project` counts, `task_ids`, `newly_assigned_ids` (tasks whose assignee changed to `patch.assignee_id`; tasks already assigned to that user are excluded), `completed_ids` (tasks that became done). A `milestone_id` in the patch is rejected with a user-facing `Error` unless every task belongs to that milestone's project (My tasks selections span projects).
- `bulkDeleteTasks(ids: string[]): BulkDeleteResult` — `BulkResult` plus `blob_urls` (§17 blob cleanup).

`src/lib/data/comments.ts` (extend; tasks owns it in W2)
- `listTaskComments(taskId: string): Comment[]` (oldest first).
- `createComment(projectId: string, userId: string, body: string, taskId?: string | null): Comment` — the optional 4th parameter stores `task_id` (existing callers unchanged).
- `deleteComment(id: string): { blob_urls: string[] }` — file attachments of the comment (v1 callers ignore the value).

`src/lib/data/activity.ts` (extend; tasks owns it in W2)
- `logActivity(input: { project_id; actor_id; type; message; meta?; task_id? }, q?: Queryable): void` — optional connection so writes inside a transaction can log in the same transaction.
- `listTaskActivity(taskId: string, limit?: number): Activity[]` — newest first.

### 17.3 W2 `delivery`

`src/lib/data/milestones.ts` (new)
- `listMilestones(projectId: string, options?: ProjectQueryOptions): MilestoneWithMeta[]` — by position; `price`/`invoice_status` null unless `includeCommercial`.
- `listMilestoneRefs(projectId: string): MilestoneRef[]` — by position (task filters, grouping and pickers; no commercial fields).
- `getMilestone(id: string, options?: ProjectQueryOptions): MilestoneWithMeta | null`.
- `createMilestone(input: CreateMilestoneInput, options?: ProjectQueryOptions): Milestone` — position = max + 1; rejects a non-null `price` while the project's `currency` is NULL ("Set the project's currency before adding phase prices."). Stripped unless `includeCommercial`.
- `updateMilestone(id: string, patch: UpdateMilestoneInput, options?: ProjectQueryOptions): Milestone` — maintains `completed_at`; refuses `status: "done"` on a phase with `requires_gate` unless `gate_decision = 'go'` (gated phases complete only through `decideGate`, §17.6) and refuses `status: "gate_review"` (use `requestGateReview`); same price/currency rule as create; recomputes project progress when a phase status changes. When a non-gated phase becomes done and no other phase is `active` or `gate_review`, calls `activateNextPhase(projectId, tx)` in the same transaction so `current_phase` never goes empty mid-plan. Stripped unless `includeCommercial`.
- `deleteMilestone(id: string): { project_id: string; name: string }` — tasks keep existing (`milestone_id` SET NULL); recomputes progress.
- `reorderMilestones(projectId: string, orderedIds: string[]): void`.
- `requestGateReview(id: string, options?: ProjectQueryOptions): Milestone` — guarded `UPDATE ... WHERE status = 'active' AND requires_gate`; throws a user-facing `Error` when the guard fails. Stripped unless `includeCommercial`.
- `activateNextPhase(projectId: string, q?: Queryable, options?: ProjectQueryOptions): Milestone | null` — the first row with `kind = 'phase' AND status = 'planned'` by position becomes `active` (point milestones such as Go-live are never activated). Stripped unless `includeCommercial`.
- `listDeliverables(milestoneId: string): TaskWithMeta[]` — tasks with `is_deliverable` for that milestone (may import `listTasks` from tasks.ts).
- `listGateHistory(milestoneId: string): Activity[]` — activity with `type IN ('gate_requested', 'gate_decided') AND meta->>'milestone_id' = $1`, newest first, hydrated like `listProjectActivity` (meta shapes `GateRequestedMeta` / `GateDecidedMeta`). `GateFields` renders it as "Decision history" (via `getMilestonePanelAction`), and so does the GateDialog (via `GateReviewData.history`).

`src/lib/data/project-detail.ts` (new)
- `getProjectTabCounts(projectId: string): ProjectTabCounts` — one round trip (scalar subqueries over the v2 tables).

### 17.4 W2 `commercial`

`src/lib/data/app-settings.ts` (new)
- `getAppSettings(options?: ProjectQueryOptions, q?: Queryable): AppSettings` — re-inserts the default row when missing (`INSERT ... ON CONFLICT DO NOTHING`, on `q` when given); `usd_inr_rate` null unless `includeCommercial`.
- `getWorkspaceTimezone(): string` (validated with `safeTimeZone`), `getWorkspaceToday(now?: Date): string` (= `workspaceToday(await getWorkspaceTimezone(), now)`).
- `updateAppSettings(patch: UpdateAppSettingsInput, userId: string): AppSettings` — validates the timezone with `isValidTimeZone`.
- `markLabelsSeeded(q?: Queryable): void`.

`src/lib/data/labels.ts` (new)
- `ensureDefaultLabels(): void` — when `app_settings.labels_seeded_at IS NULL OR NOT EXISTS (SELECT 1 FROM labels)`: inserts `DEFAULT_LABELS` with `ON CONFLICT (lower(name)) DO NOTHING` and sets the flag, in one transaction. Deleting individual labels sticks; only an empty catalogue re-seeds (a `TRUNCATE ... CASCADE` empties `labels` but keeps the flag).
- `listLabels(): Label[]` (calls `ensureDefaultLabels()` first; ordered by group then name), `listLabelsWithUsage(): LabelWithUsage[]`. Neither `listLabels` nor `ensureDefaultLabels` may run inside a transaction (they open their own); templates use `findOrCreateLabelsByName(…, tx)`.
- `createLabel(input: CreateLabelInput, createdBy: string): Label` — returns the existing label when the name exists (case-insensitive); default colour from `colorFromString(name, LABEL_COLORS)`.
- `updateLabel(id: string, patch: UpdateLabelInput): Label` (duplicate names → user-facing `Error`), `deleteLabel(id: string): void`.
- `setProjectLabels(projectId: string, labelIds: string[], q?: Queryable): LabelSummary[]`.
- `findOrCreateLabelsByName(names: string[], createdBy: string, q?: Queryable): LabelSummary[]` (templates).

`src/lib/data/clients.ts` (new)
- `listClients(filters?: ClientFilters, options?: ProjectQueryOptions): ClientWithMeta[]` — `commercial` null unless `includeCommercial`; confidential clients are listed normally (internal app).
- `listClientSummaries(): ClientSummary[]` — non-archived, by name (pickers).
- `getClient(id: string, options?: ProjectQueryOptions): ClientWithMeta | null`, `getClientByCode(code: string): Client | null`.
- `createClient(input: CreateClientInput, createdBy: string): Client` — code upper-cased; duplicate code → user-facing `Error`; colour defaults from `colorFromString(name, CLIENT_COLORS)`; currency defaults from `CLIENT_REGION_CONFIG[region].defaultCurrency`.
- `updateClient(id: string, patch: UpdateClientInput): Client` (`archived` toggles `archived_at`), `deleteClient(id: string): void` (projects keep existing with `client_id` NULL).
- `suggestClientCode(name: string): string` — 2-6 uppercase chars derived from the name, unique (numeric suffix when taken).

`src/lib/data/projects.ts` (extend the write side)
- `export interface CreateProjectOptions extends ProjectQueryOptions { afterInsert?: (tx: Queryable, project: Project) => Promise<void> }` — `afterInsert` runs inside the create transaction (templates apply phases/tasks/metrics/risks there) and may only use the `tx` it receives (§17 transactions).
- `createProject(input: CreateProjectFullInput, createdBy: string, options?: CreateProjectOptions): Project` — persists every v2 field; `label_ids` via `setProjectLabels(…, tx)`; a sub-project inherits `client_id`, `currency` and `service_line` from its parent when not given; `currency` defaults to the client's; `progress_mode` defaults to the column default ('manual') when omitted (the action passes 'tasks' for new projects); `tuning_days = input.tuning_days ?? (await getAppSettings()).default_tuning_days` (templates pass the payload's value; the settings read happens before the transaction opens); rejects `contract_value`/`hourly_rate` without a resulting currency with a user-facing `Error` ("Pick a currency before entering amounts."); recomputes progress when the mode is not manual.
- `updateProject(id: string, patch: UpdateProjectFullInput, options?: ProjectQueryOptions): Project` — same for updates; switching `progress_mode` recomputes progress. Rejects (user-facing `Error`, "Clear the contract value, hourly rate and phase prices before changing the currency.") a `currency` change or clear while `contract_value`, `hourly_rate` or any milestone `price` of the project is set — unless no phase price is set and the same patch restates (or clears) every project amount that is set, so no amount silently changes meaning. `UpdateProjectFullInput` has no `go_live_date`/`tuning_days` (§17.6 `setGoLiveDate`).
- `deleteProject(id: string): { blob_urls: string[] }` — v1 cascade; `blob_urls` = file attachments of the whole subtree (`getSubtreeIds`), collected in the same transaction before the delete.
- `bulkUpdateProjects(ids: string[], patch: BulkProjectPatch): BulkResult` — `per_project` is 1 per changed project; the task arrays are empty.
- `getProjectSummary(id: string): ProjectSummary | null`, `listProjectSummaries(filters?: { openOnly?: boolean; memberId?: string; clientId?: string }): ProjectSummary[]` (pickers: timer, log time, calendar quick create).
- `getProjectStats(scope?: "top_level" | "all", today?: string): ProjectStats` — `today` defaults to `await getWorkspaceToday()`; callers usually pass the workspace today they already computed.

### 17.5 W3

`src/lib/data/notifications.ts` (`notifications`)
- `notify(input: NotifyInput, q?: Queryable): number` — one row per recipient after removing the actor, duplicates and inactive users; dedupe with the partial unique index; returns rows inserted.
- **Watchers = explicit ∪ implicit, minus muted.** Explicit watchers are non-muted `subscriptions` rows. Implicit watchers need no row: for a project its owner, members and creator; for a task its creator and assignee. A `muted` row (explicit Unwatch) removes the user even when they are implicit. This makes watching work on legacy and bulk-edited data without backfills. `notifyWatchers`, `isWatching` and `listWatchers` all use this union.
- `notifyWatchers(input: Omit<NotifyInput, "recipients"> & { entity: WatchEntity; extraRecipients?: string[] }, q?: Queryable): number` — the entity's watchers (above) plus `extraRecipients`.
- `listNotifications(userId: string, filters?: NotificationFilters): AppNotification[]` — newest first; `mentions` tab = type 'mention'; default limit 30.
- `countUnread(userId: string): number`, `markRead(userId: string, ids: string[]): number`, `markAllRead(userId: string): number`.
- `pruneReadNotifications(userId: string, today: string): number` — read and older than `NOTIFICATION_RETENTION_DAYS`.
- `generateTimeBasedNotifications(userId: string, today: string, timeZone: string): number` — lazy, idempotent via dedupe keys (§23.2): `due_soon` (user's open tasks due tomorrow), `update_due` (top-level projects the user owns for which `isUpdateDue(project, today, update_cadence_days, timeZone)` holds), `tuning_ending` (projects the user owns, or all for admins, with an open tuning window ending within `TUNING_ALERT_DAYS`). Callers read `today`, `timeZone` and the cadence before calling. Budget thresholds are event-driven (W5 time).
- `autoSubscribe(entity: WatchEntity, userIds: string[], q?: Queryable): void` — `INSERT ... ON CONFLICT DO NOTHING` (never clears `muted`). Still called on every creation path (§18) so explicit rows exist for people who are not implicit watchers (commenters, former assignees).
- `watch(userId: string, entity: WatchEntity): void` (clears `muted`), `unwatch(userId: string, entity: WatchEntity): void` (upserts `muted = true`), `isWatching(userId: string, entity: WatchEntity): boolean`, `listWatchers(entity: WatchEntity): UserSummary[]` (both use the explicit ∪ implicit − muted union).
- `resolveMentionRecipients(body: string): string[]` — active user ids among `parseMentions(body)`.

`src/lib/data/attachments.ts` (`attachments`)
- `isBlobEnabled(): boolean` — `Boolean(process.env.BLOB_READ_WRITE_TOKEN)`; server only, passed to UI as a prop.
- `listAttachments(filters: AttachmentFilters): Attachment[]`, `listKeyLinks(projectId: string): Attachment[]` (pinned project-level links by `LINK_TYPE_ORDER`), `getAttachment(id: string): Attachment | null`.
- `createLinkAttachment(input: CreateLinkAttachmentInput, userId: string): Attachment` — rejects non-http(s) URLs (`isHttpUrl`); `link_type` defaults to `detectLinkType(url)`; `name` defaults to the host.
- `createFileAttachment(input: CreateFileAttachmentInput, userId: string): Attachment` — requires `new URL(url).hostname` to end with `BLOB_HOST_SUFFIX` and `blob_pathname` to start with `${ATTACHMENT_PATH_PREFIX}${project_id}/`; `size_bytes ≤ MAX_UPLOAD_BYTES`; mime in `ALLOWED_UPLOAD_CONTENT_TYPES`.
- `updateAttachment(id: string, patch: { name?: string; link_type?: LinkType | null; pinned?: boolean }): Attachment`, `deleteAttachment(id: string): Attachment | null` (returns the deleted row so the action can delete the blob).
- `deleteBlobs(urls: string[]): void` — `del(urls)` from `@vercel/blob` when `isBlobEnabled()` and the list is non-empty; logs failures with `console.error` and never throws. Used by `deleteAttachmentAction` and after every cascade that returns `blob_urls` (§17 blob cleanup).

`src/lib/data/search.ts` (`search`)
- `searchAll(query: string, userId: string): SearchResults` — 1-`SEARCH_QUERY_MAX` chars; up to `SEARCH_RESULTS_PER_GROUP` per group; prefix matches (`likePrefix` on the lower() indexes) rank before substring matches (`likeContains`); an exact `parseTaskKey()` match is the first task; comment hits carry a `mentionsToPlainText` snippet; people = active users by name/email.

`src/lib/data/calendar.ts` (`calendar`)
- `listCalendarItems(filters: CalendarFilters): CalendarItem[]` — tasks by `due_date`; milestones by `due_date`; open projects by `due_date` (`project_due`); `go_live` by `go_live_date`; `tuning_end` by `tuningEndDate()` when tuning is open; all inside `from..to`, sorted by date then kind.

`src/lib/data/timeline.ts` (`timeline`)
- `listTimeline(filters: TimelineFilters): TimelineData` — top-level projects (open unless `includeClosed`) with milestones, grouped by client (clients by name, "No client" last), unscheduled list, overall range.
- `getProjectTimeline(projectId: string): ProjectTimelineData | null` — milestone rows (by position) with their tasks, then a "No milestone" row.

### 17.6 W4

`src/lib/data/templates.ts` (`templates`; the data module, distinct from `src/lib/templates.ts`)
- `listTemplateOptions(): TemplateOption[]` — `BUILTIN_TEMPLATE_OPTIONS` then custom templates by name.
- `listCustomTemplates(): ProjectTemplate[]`, `getCustomTemplate(id: string): ProjectTemplate | null`.
- `getTemplatePayload(templateKey: string): TemplatePayload | null` — via `parseTemplateKey`.
- `createCustomTemplate(input: CreateProjectTemplateInput, userId: string): ProjectTemplate`, `updateCustomTemplate(id: string, patch: UpdateProjectTemplateInput): ProjectTemplate`, `deleteCustomTemplate(id: string): void`.
- `captureTemplateFromProject(projectId: string): TemplatePayload` — milestones and tasks as offsets from the project start (`start_date`, else the earliest milestone/task date, else the created date), current metrics (targets kept) and open risks, the project's label names.
- `applyTemplate(tx: Queryable, projectId: string, payload: TemplatePayload, startDate: string, userId: string): { milestones: number; tasks: number; metrics: number; risks: number }` — uses `computeTemplateSchedule`; first phase `active`, rest `planned`; inserts milestones (with `phase_key`), tasks (checklists into `task_checklist_items`, deliverable flags, estimates, `created_by = userId`, positions per status column), metrics, risks and labels with raw SQL on `tx` (never `createTask`, `listLabels` or another function that opens its own connection; labels via `findOrCreateLabelsByName(…, tx)` and `setProjectLabels(…, tx)`), then `recomputeProjectProgress(projectId, tx)` once.
- `cloneEngagementContext(tx: Queryable, sourceProjectId: string, targetProjectId: string, include: { labels: boolean; metrics: boolean; members: boolean }): void` — for Convert to pilot / Propose retainer; raw SQL on `tx`.

`src/lib/data/scorecard.ts` (`scorecard`)
- `listMetrics(projectId: string): SuccessMetricWithStatus[]` — trend from eval runs with a metric of the same name (case-insensitive, queried directly from `eval_runs`).
- `createMetric(input: CreateMetricInput): SuccessMetric` (at most `MAX_SUCCESS_METRICS` per project), `updateMetric(id: string, patch: UpdateMetricInput): { metric: SuccessMetric; changed_after_lock: boolean }` (baseline/target change after `locked_at` requires `patch.reason`, else user-facing `Error`), `deleteMetric(id: string): { project_id: string; name: string }`, `reorderMetrics(projectId: string, orderedIds: string[]): void`. Create and update turn a unique violation (23505 on `uq_success_metrics_project_name`) into the user-facing `Error` "A metric with this name already exists." Matching metric names against eval-run metrics (trends, direction, promote-to-champion) is case-insensitive everywhere.
- `lockMetrics(projectId: string): number` — sets `locked_at` on unlocked metrics.
- `getGateReview(milestoneId: string, options?: ProjectQueryOptions): GateReviewData | null` — queries tasks, metrics, `eval_runs` (champion) and `risks` (open/mitigating with score ≥ `RISK_SCORE_RED`) directly; does not import sibling W4 modules.
- `getGateReview` also fills `GateReviewData.history` with `listGateHistory(milestoneId)` (§17.3) for the GateDialog's "Decision history".
- `decideGate(milestoneId: string, input: GateDecisionInput, userId: string, options?: ProjectQueryOptions): { milestone: Milestone; next_phase: Milestone | null }` — one transaction guarded by `WHERE status = 'gate_review'` (user-facing `Error` when the guard fails, e.g. decided by someone else). Go: status done, `completed_at`, `activateNextPhase(projectId, tx, options)`. Extend: requires `extend_count < MAX_GATE_EXTENSIONS`, `new_due_date` and `fix_list`; status active, `due_date = new_due_date`, `extend_count + 1`, fix list appended to `gate_notes`. Stop: status stopped. Always writes `gate_decision`, `gate_decided_by/at`, `gate_notes`, sign-off and evidence fields, then recomputes progress. Both returned milestones are stripped unless `includeCommercial`.

`src/lib/data/golive.ts` (`scorecard`) — the only write path for `go_live_date`.
- `getGoLiveSummary(projectId: string, today: string): GoLiveSummary` — `handover_total/done` count non-cancelled deliverables of the `phase_key = 'scale'` phase (one per handover item).
- `setGoLiveDate(projectId: string, date: string | null, tuningDays?: number, options?: ProjectQueryOptions): Project` — one transaction. With a date: sets `go_live_date` (and `tuning_days` only when `tuningDays` is passed; otherwise the project keeps its value) and `delivery_state = 'production'` unless already `handed_over`; marks the `phase_key = 'go_live'` milestone (if any) done with `due_date = date` and `completed_at`; if the `phase_key = 'scale'` phase is `planned`, makes it `active` with `start_date = date` and `due_date = addDaysISO(date, max(tuning_days, 1) - 1)` (the `computeTemplateSchedule` span rule); recomputes progress. With `null`: clears `go_live_date` and, when `delivery_state` is `production`, sets it back to `pilot`; milestones are left as they are (the action logs `go_live_cleared`). Returns a stripped row unless `includeCommercial`.
- `closeTuning(projectId: string, options?: ProjectQueryOptions): Project` — sets `tuning_closed_at` and `delivery_state = 'handed_over'`; returns a stripped row unless `includeCommercial`.

`src/lib/data/status-updates.ts` (`updates-risks`)
- `listStatusUpdates(projectId: string, limit?: number): StatusUpdate[]` (newest first), `getStatusUpdate(id: string): StatusUpdate | null`, `getLatestStatusUpdate(projectId: string): StatusUpdate | null`.
- `getStatusUpdateDraft(projectId: string, today: string): StatusUpdateDraft` — changes since the previous update; `suggested_budget_rag = suggestBudgetRag(computeBudgetBurn(...))` (time minutes summed directly from `time_entries`).
- `createStatusUpdate(input: CreateStatusUpdateInput, authorId: string, today: string): StatusUpdate` — computes `week_of = startOfWeekISO(today)`, `changes`, `metrics_snapshot`; sets `projects.health/health_updated_at` in the same transaction.
- `updateStatusUpdate(id: string, patch: UpdateStatusUpdateInput): StatusUpdate`, `deleteStatusUpdate(id: string): { project_id: string }` — both re-denormalise project health from the latest remaining update.

`src/lib/data/risks.ts` (`updates-risks`)
- `listRisks(filters?: RiskFilters): RiskWithMeta[]` — default order: severity desc, then review_date asc.
- `getRisk(id: string): RiskWithMeta | null`, `createRisk(input: CreateRiskInput, userId: string): Risk`, `updateRisk(id: string, patch: UpdateRiskInput): Risk` (maintains `closed_at`), `convertRiskToIssue(id: string): Risk` (kind → issue, status → open), `closeRisk(id: string): Risk`, `deleteRisk(id: string): { project_id: string; title: string }`.
- `getRiskHeatmap(projectId: string): RiskHeatCell[]` — open/mitigating only, 25 cells.
- `countOverdueRiskReviews(today: string, ownerId?: string): number`.

`src/lib/data/evals.ts` (`evals-batches`)
- `listEvalRuns(projectId: string): EvalRunWithMeta[]` (newest first, deltas vs the champion), `getEvalRun(id: string): EvalRunWithMeta | null`, `getChampionRun(projectId: string): EvalRunWithMeta | null`.
- `createEvalRun(input: CreateEvalRunInput, userId: string): EvalRun`, `updateEvalRun(id: string, patch: UpdateEvalRunInput): EvalRun`, `deleteEvalRun(id: string): { project_id: string; label: string }`.
- `promoteChampion(id: string, options: { updateScorecard: boolean }): PromoteChampionResult` — one transaction: archive the current champion first, then promote (the partial unique index guarantees one champion); optionally copy metric values into `success_metrics.current` for metrics with the same name (`current_measured_at = now`).
- `listMetricNames(projectId: string): string[]` — scorecard + run metric names (autocomplete).

`src/lib/data/batches.ts` (`evals-batches`)
- `listBatches(projectId: string): DataBatch[]` (calibration first, then by number), `getBatch(id: string): DataBatch | null`.
- `createBatch(input: CreateBatchInput, userId: string): DataBatch`, `updateBatch(id: string, patch: UpdateBatchInput): DataBatch` (stamps `delivered_at`/`accepted_at` on status changes), `deleteBatch(id: string): { project_id: string; number: number }` — every write calls `recomputeProjectProgress` in its transaction.
- `getBatchSummary(projectId: string, timeZone: string): DataBatchSummary` — `accepted_per_week` buckets `accepted_at` with `startOfWeekISO(dateInTimeZone(accepted_at, timeZone))`.

### 17.7 W5

`src/lib/data/time.ts` (`time`)
- `getRunningTimer(userId: string): RunningTimer | null`.
- `startTimer(userId: string, input: StartTimerInput, today: string): { timer: RunningTimer; stopped_entry: TimeEntry | null }` — stops (and logs) a running timer first; prunes stopped timers older than `STOPPED_TIMER_RETENTION_DAYS`.
- `stopTimer(userId: string, today: string): { timer: Timer; entry: TimeEntry } | null` — entry minutes = `minutesBetween(started_at, now)` capped at `MAX_ENTRY_MINUTES`, `entry_date = today`, `source = 'timer'`.
- `undoStopTimer(userId: string, timerId: string): RunningTimer` — deletes the entry and clears `stopped_at` (fails when another timer is running).
- `discardTimer(userId: string): void`.
- `listTimeEntries(filters: TimeEntryFilters): TimeEntryWithMeta[]`, `getTimeEntry(id: string): TimeEntry | null`.
- `logTime(userId: string, input: LogTimeInput): TimeEntry` — `billable` defaults to false when the project's engagement type is `internal`; `milestone_id` taken from the task.
- `updateTimeEntry(id: string, patch: UpdateTimeEntryInput): TimeEntry`, `deleteTimeEntry(id: string): { project_id: string }`.
- `getTimesheet(userId: string, weekStart: string): TimesheetWeek`, `setTimesheetCell(userId: string, input: TimesheetCellInput): void` (the cell total becomes `minutes`; manual/timer entries in the cell are kept and counted, so the cell's single timesheet row holds `minutes − (manual + timer minutes)`, capped at `MAX_ENTRY_MINUTES`. When that is ≤ 0 (including `minutes = 0`) it `DELETE`s the timesheet row; otherwise it runs `INSERT ... ON CONFLICT (user_id, project_id, COALESCE(task_id, ''), entry_date) WHERE source = 'timesheet' DO UPDATE SET minutes = EXCLUDED.minutes, updated_at = EXCLUDED.updated_at` — the partial unique index makes overlapping autosaves of one cell update the same row instead of doubling it), `getPreviousWeekRows(userId: string, weekStart: string): Pick<TimesheetRow, "key" | "project" | "task">[]`.
- `getProjectTimeSummary(projectId: string, today: string): ProjectTimeSummary`, `getBudgetBurn(projectId: string, today: string): BudgetBurn | null`, `getLoggedMinutesThisWeek(userId: string, today: string): number`.
- `crossedBudgetThreshold(projectId: string, today: string, beforeMinutes: number): BudgetThreshold | null` — the threshold newly crossed by the latest write (for the event-driven notification).
- **ADMIN-ONLY**: `listUserCostRates(): UserCostRate[]`, `setUserCostRate(userId: string, rate: number | null): void`. Also `setUserWeeklyCapacity(userId: string, hours: number): void`.
- **ADMIN-ONLY**: `getProjectMargin(projectId: string): ProjectMargin` — `usd_inr_rate` from app settings; `project` = the project's `MarginRow` (null without a contract value); `phases` = every `kind = 'phase'` milestone by position with its price, the project's currency, minutes logged with that `milestone_id`, `cost_inr` (minutes / 60 × cost_rate per user) and `approx_margin_inr` (`toInr(price) − cost_inr`, null without a price). Labelled approximate wherever shown.

`src/lib/data/reports.ts` (`reports`) — every function takes the filters it needs; none trusts client input for scope.
- `getPortfolioHealth(today: string, cadenceDays: number, timeZone: string): PortfolioHealthReport` (stale = `isUpdateDue`), `projectsByServiceLine(): ServiceLineStatusRow[]`.
- `throughputByWeek(filters: ReportFilters, timeZone: string): ThroughputPoint[]` (task `created_at`/`completed_at` mapped to workspace dates with `dateInTimeZone`), `overdueByAssignee(today: string): OverdueByAssigneeRow[]`.
- `hoursByWeek(filters: ReportFilters): HoursWeekPoint[]`, `hoursByClient(filters: ReportFilters): HoursByClientRow[]`, `burnByProject(today: string): BurnRow[]`.
- `workloadGrid(today: string, weeks?: number): WorkloadRow[]` — default `WORKLOAD_WEEKS`; spreads each open assigned task's `estimate_minutes` evenly over working days from `start_date` (or today) to `due_date` (tasks without due date or estimate are skipped).
- **ADMIN-ONLY**: `contractValueByCurrency(): ContractValueRow[]`, `invoiceStatusSummary(): InvoiceStatusRow[]`, `marginByProject(filters: ReportFilters): MarginRow[]`.
- `exportProjectsCsv(includeCommercial: boolean): string`, `exportTasksCsv(filters: TaskFilters): string` (built with `toCsv`; confidential clients appear as their code).

`src/lib/data/views.ts` (`productivity`)
- `listSavedViews(userId: string, scope?: SavedViewScope): SavedView[]` — own + shared, own first by position.
- `createSavedView(userId: string, input: CreateSavedViewInput): SavedView`, `updateSavedView(id: string, patch: UpdateSavedViewInput): SavedView`, `deleteSavedView(id: string): void`, `reorderSavedViews(userId: string, orderedIds: string[]): void`, `getSavedView(id: string): SavedView | null`.
- `listFavorites(userId: string): FavoriteProject[]`, `isFavorite(userId: string, projectId: string): boolean`, `toggleFavorite(userId: string, projectId: string): boolean` (returns the new state), `reorderFavorites(userId: string, orderedIds: string[]): void`.

`src/lib/data/home.ts` (`home`)
- `getHomeStats(userId: string, today: string): HomeStats`.
- `listGatesAwaiting(): GateAwaiting[]`, `listMilestonesDue(today: string, days?: number): MilestoneDue[]` (default `MILESTONE_DUE_WINDOW_DAYS`), `listTuningEnding(today: string, days?: number): TuningWindow[]` (default `TUNING_ENDING_WINDOW_DAYS`), `listStaleUpdates(today: string, cadenceDays: number, timeZone: string): StaleUpdate[]` (open top-level projects for which `isUpdateDue` holds), `listPortfolioHealth(): (ProjectSummary & { health: RagHealth | null; health_updated_at: string | null })[]` (open top-level engagements, red first).

## 18. Server actions v2 (`src/actions/*.ts`) — exact exports

Every action follows §2: `"use server"`; (1) `requireUser()` (or `requireAdmin()`); (2) validate with the owner's zod schema (`src/lib/schemas/<area>.ts`, ids as non-empty strings, dates with `isDateOnly`, money as `z.number().int().min(0).max(MAX_MONEY)` — `contract_value`, `hourly_rate`, `price`, `cost_rate` — and every other integer `.int().min(0).max(MAX_DB_INT)` or its lower business cap, §16); (3) permission checks; (4) data layer; (5) activity (§23.1) and, from W3 on, notifications (§23.2); (6) `revalidatePath("/", "layout")`; (7) return `ActionResult<T>`. Catch everything and return `{ ok: false, error }` with a friendly sentence (user-facing `Error` messages from the data layer may be passed through). "Member" = any active signed-in user; "Admin" = `role === "admin"`; "Owner" = the project's `owner_id`; "Creator" = `created_by`.

**Commercial rule (all actions).** The admin-only keys are `contract_value`, `hourly_rate` (projects), `price`, `invoice_status` (milestones), `usd_inr_rate` (app settings) and `cost_rate` (users). If a non-admin sends any of these keys, even with `null`, the action returns `{ ok: false, error: "Only admins can change commercial fields." }` without writing anything. Actions that return a `Project`, `Milestone` or `AppSettings` load it with `includeCommercial: user.role === "admin"`. Activity messages and notifications never contain amounts ("updated the commercial terms").

Every action below names the `ActivityType` it logs (§23.1); "no activity" marks the exempt ones.

### 18.1 W2

`src/actions/tasks.ts` (`tasks`)
- `createTaskAction(input: CreateTaskInput): Promise<ActionResult<TaskWithMeta>>` — Member; logs `task_created`.
- `updateTaskAction(id: string, input: UpdateTaskInput): Promise<ActionResult<TaskWithMeta>>` — Member. Logs `task_status_changed` / `task_assigned` / `deliverable_approved` (when `approved_by_name` is first set) / otherwise `task_updated`.
- `updateTaskStatusAction(id: string, status: TaskStatus): Promise<ActionResult<TaskWithMeta>>` — Member (keyboard alternative to dragging); logs `task_status_changed`.
- `moveTaskAction(id: string, input: MoveTaskInput): Promise<ActionResult<TaskWithMeta>>` — Member; logs `task_status_changed` when the status changes (reordering inside a column logs nothing).
- `deleteTaskAction(id: string): Promise<ActionResult<{ project_id: string }>>` — Admin, task creator or project owner. Logs `task_deleted` (keeps `task_id`); deletes the returned `blob_urls` after commit (W3 integration wires `deleteBlobs`).
- `getTaskDetailAction(idOrKey: string): Promise<ActionResult<TaskDetail>>` — Member (accepts a uuid or "PRX-n").
- `searchTaskRefsAction(input: { query?: string; projectId?: string; excludeId?: string; limit?: number }): Promise<ActionResult<TaskRef[]>>` — Member; built on `listTasks` with `search`, `status: OPEN_TASK_STATUSES` by default, `excludeId` removed, limit ≤ 20 (default 10). Used by the drawer's blocked-by picker and reused by W5's TimerPill and LogTimeDialog task pickers.
- `setTaskLabelsAction(taskId: string, labelIds: string[]): Promise<ActionResult<LabelSummary[]>>` — Member; logs `task_updated` ("updated the labels").
- `addChecklistItemAction(taskId: string, title: string): Promise<ActionResult<TaskChecklistItem>>`, `updateChecklistItemAction(id: string, patch: { title?: string; done?: boolean }): Promise<ActionResult<TaskChecklistItem>>`, `deleteChecklistItemAction(id: string): Promise<ActionResult>`, `reorderChecklistAction(taskId: string, orderedIds: string[]): Promise<ActionResult>` — Member (checklist edits log `task_updated` at most once per action; ticking an item does not log).
- `setBlockedByAction(taskId: string, blockedByIds: string[]): Promise<ActionResult<TaskRef[]>>` — Member; logs `task_blockers_changed`.

`src/actions/comments.ts` (`tasks`, extend)
- `addTaskCommentAction(taskId: string, body: string): Promise<ActionResult<Comment>>` — Member; logs `comment_added` with `task_id`.
- `listTaskCommentsAction(taskId: string): Promise<ActionResult<Comment[]>>` — Member.
- `addCommentAction` / `deleteCommentAction` keep their v1 signatures and activity behaviour (delete works for task comments too; after commit it deletes the returned `blob_urls`, wired by W3 integration).

`src/actions/milestones.ts` (`delivery`) — every action that returns a milestone loads it with `{ includeCommercial: user.role === "admin" }`.
- `createMilestoneAction(input: CreateMilestoneInput): Promise<ActionResult<Milestone>>` — Member (commercial rule for `price`/`invoice_status`); logs `milestone_created`.
- `updateMilestoneAction(id: string, input: UpdateMilestoneInput): Promise<ActionResult<Milestone>>` — Member; logs `milestone_completed` when it becomes done, else `milestone_updated`.
- `setMilestoneStatusAction(id: string, status: MilestoneStatus): Promise<ActionResult<Milestone>>` — Member; same gate rules as `updateMilestone`; logs `milestone_completed` when it becomes done, else `milestone_updated`.
- `deleteMilestoneAction(id: string): Promise<ActionResult>` — Admin or project owner; logs `milestone_deleted`.
- `reorderMilestonesAction(projectId: string, orderedIds: string[]): Promise<ActionResult>` — Member (keyboard alternative: move up/down menu items); logs `milestones_reordered`.
- `requestGateReviewAction(id: string): Promise<ActionResult<Milestone>>` — Member; logs `gate_requested` with `meta: GateRequestedMeta` (`{ milestone_id, milestone_name }`).
- `getMilestonePanelAction(id: string): Promise<ActionResult<{ milestone: MilestoneWithMeta; deliverables: TaskWithMeta[]; gate_history: Activity[] }>>` — Member (phase panel on click; `gate_history` from `listGateHistory`).
- `listMilestoneRefsAction(projectId: string): Promise<ActionResult<MilestoneRef[]>>` — Member (task drawer milestone picker, `NewTaskDialogHost`, bulk bar).

`src/actions/clients.ts` (`commercial`)
- `createClientAction(input: CreateClientInput): Promise<ActionResult<Client>>` — Member; logs `client_created` (project_id null, `meta.client_id`).
- `updateClientAction(id: string, input: UpdateClientInput): Promise<ActionResult<Client>>` — Member; logs `client_updated`.
- `deleteClientAction(id: string): Promise<ActionResult>` — Admin; logs `client_deleted`.
- `suggestClientCodeAction(name: string): Promise<ActionResult<string>>` — Member.

`src/actions/labels.ts` (`commercial`)
- `createLabelAction(input: CreateLabelInput): Promise<ActionResult<Label>>` — Member; no activity (catalogue).
- `updateLabelAction(id: string, input: UpdateLabelInput): Promise<ActionResult<Label>>`, `deleteLabelAction(id: string): Promise<ActionResult>` — Admin; no activity (catalogue).
- `setProjectLabelsAction(projectId: string, labelIds: string[]): Promise<ActionResult<LabelSummary[]>>` — Member; logs `project_updated` ("updated the labels").
- `listLabelsAction(): Promise<ActionResult<Label[]>>` — Member (pickers that open lazily).

`src/actions/app-settings.ts` (`commercial`)
- `updateAppSettingsAction(input: UpdateAppSettingsInput): Promise<ActionResult<AppSettings>>` — Admin; no activity (configuration).

`src/actions/projects.ts` (`commercial`, extend; v1 exports keep working)
- `createProjectAction(input: CreateProjectFullInput): Promise<ActionResult<{ id: string }>>` — Member; commercial rule; passes `progress_mode: DEFAULT_NEW_PROJECT_PROGRESS_MODE` when the input has none; `template_key`/`source_project_id`/`tuning_days` are ignored here (only the templates actions set them); logs `project_created` (and v1's `subproject_created` on the parent).
- `updateProjectAction(id: string, input: UpdateProjectFullInput): Promise<ActionResult<Project>>` — Member; commercial rule; returns `{ ok: false, error: "Use Set go-live date." }` without writing when the raw input carries `go_live_date` or `tuning_days`; field labels for the activity message cover the v2 fields.
- `updateProjectStatusAction`, `updateProjectProgressAction` (refuses when `progress_mode` is not manual), `deleteProjectAction` (after commit deletes the returned `blob_urls`, wired by W3 integration), `setProjectMembersAction`, `reorderProjectsAction` — unchanged signatures and v1 activity.
- `getProjectFormOptionsAction(): Promise<ActionResult<{ clients: ClientSummary[]; labels: Label[]; isAdmin: boolean }>>` — Member; `ProjectDialog` loads it when opened.

### 18.2 W3

`src/actions/notifications.ts` (`notifications`)
- `getUnreadCountAction(): Promise<ActionResult<number>>`.
- `listNotificationsAction(filters?: NotificationFilters): Promise<ActionResult<AppNotification[]>>`.
- `markNotificationsReadAction(ids: string[]): Promise<ActionResult<number>>`, `markAllNotificationsReadAction(): Promise<ActionResult<number>>` — own notifications only. These do not call `revalidatePath` for the whole layout (the bell refreshes itself).
- `watchAction(entity: WatchEntity): Promise<ActionResult<boolean>>`, `unwatchAction(entity: WatchEntity): Promise<ActionResult<boolean>>`, `getWatchStateAction(entity: WatchEntity): Promise<ActionResult<{ watching: boolean; watchers: UserSummary[] }>>` — Member.

`src/actions/attachments.ts` (`attachments`)
- `createLinkAttachmentAction(input: CreateLinkAttachmentInput): Promise<ActionResult<Attachment>>` — Member; logs `attachment_added`.
- `createFileAttachmentAction(input: CreateFileAttachmentInput): Promise<ActionResult<Attachment>>` — Member; only when `isBlobEnabled()`; logs `attachment_added`.
- `updateAttachmentAction(id: string, patch: { name?: string; link_type?: LinkType | null; pinned?: boolean }): Promise<ActionResult<Attachment>>` — Member; logs `attachment_updated` (pin, unpin or rename).
- `deleteAttachmentAction(id: string): Promise<ActionResult>` — uploader, admin or project owner; deletes the blob with `deleteBlobs([url])` for file attachments; logs `attachment_removed`.
- `listAttachmentsAction(filters: AttachmentFilters): Promise<ActionResult<Attachment[]>>` — Member.

`src/actions/search.ts` (`search`)
- `searchAction(query: string): Promise<ActionResult<SearchResults>>` — Member; zod 1-`SEARCH_QUERY_MAX` chars; no revalidation.

Calendar and timeline have no actions of their own: rescheduling uses `updateTaskAction(id, { due_date })`, quick create uses `createTaskAction`.

### 18.3 W4

`src/actions/templates.ts` (`templates`)
- `listTemplateOptionsAction(): Promise<ActionResult<TemplateOption[]>>` — Member.
- `createProjectFromTemplateAction(input: CreateProjectFullInput, templateKey: string): Promise<ActionResult<{ id: string }>>` — Member; commercial rule; start date = `input.start_date ?? getWorkspaceToday()`; due date defaults to the schedule's `build_end_date`; template defaults (progress mode, engagement type, service line, delivery state, budget period, tuning days) fill fields the input leaves empty; `createProject(..., { afterInsert: applyTemplate })`; logs `project_created` and `template_applied`; `autoSubscribe` the owner, members and creator to the project (template tasks have no assignee, so implicit watchers cover them).
- `saveProjectAsTemplateAction(projectId: string, input: { name: string; description?: string; service_line?: ServiceLine | null }): Promise<ActionResult<ProjectTemplate>>` — Member; no activity (custom template CRUD is configuration).
- `updateCustomTemplateAction(id: string, input: UpdateProjectTemplateInput): Promise<ActionResult<ProjectTemplate>>`, `deleteCustomTemplateAction(id: string): Promise<ActionResult>` — Admin; no activity.
- `convertToPilotAction(projectId: string): Promise<ActionResult<{ id: string }>>` — Member; only for a consulting/assessment project whose `phase_key = 'plan'` phase is done; new project from `builtin:ai_delivery` with the same client, labels and metrics, `source_project_id` set; logs `project_created` + `template_applied` on the new project and `project_converted` on the source; `autoSubscribe` the new project's owner, members and creator.
- `proposeRetainerAction(projectId: string): Promise<ActionResult<{ id: string }>>` — Member; new project from `builtin:retainer` for the same client, `source_project_id` set; logs `project_created` + `template_applied` on the new project and `project_converted` on the source; `autoSubscribe` as above.

`src/actions/scorecard.ts` (`scorecard`)
- `createMetricAction(input: CreateMetricInput): Promise<ActionResult<SuccessMetric>>` (logs `metric_added`), `updateMetricAction(id: string, input: UpdateMetricInput): Promise<ActionResult<SuccessMetric>>` (logs `metric_changed_after_lock` with the reason when applicable, else `metric_updated`), `deleteMetricAction(id: string): Promise<ActionResult>` (logs `metric_deleted`), `reorderMetricsAction(projectId: string, orderedIds: string[]): Promise<ActionResult>` (no activity: ordering only), `lockMetricsAction(projectId: string): Promise<ActionResult<number>>` (logs `metrics_locked`) — Member. Duplicate names return "A metric with this name already exists."
- `getGateReviewAction(milestoneId: string): Promise<ActionResult<GateReviewData>>` — Member.
- `decideGateAction(milestoneId: string, input: GateDecisionInput): Promise<ActionResult<{ milestone: Milestone; next_phase: Milestone | null }>>` — Admin or project owner; calls `decideGate(…, { includeCommercial: user.role === "admin" })`; logs `gate_decided` with `meta: GateDecidedMeta` (`{ milestone_id, milestone_name, decision, extend_count, new_due_date, fix_list, metrics: MetricSnapshot[], signoff: { name, date }, evidence_url }`); notifies `gate_decided`.

`src/actions/golive.ts` (`scorecard`)
- `setGoLiveDateAction(projectId: string, date: string | null, tuningDays?: number): Promise<ActionResult<Project>>` — Member; logs `go_live_set`, or `go_live_cleared` when `date` is null.
- `closeTuningAction(projectId: string, input: { early: boolean }): Promise<ActionResult<Project>>` — Admin or project owner; calls `closeTuning(projectId, { includeCommercial: user.role === "admin" })`; refuses when the handover checklist (scale-phase deliverables) is incomplete unless `early` is true; logs `tuning_closed` (`meta.early`).

`src/actions/status-updates.ts` (`updates-risks`)
- `getStatusUpdateDraftAction(projectId: string): Promise<ActionResult<StatusUpdateDraft>>` — Member.
- `createStatusUpdateAction(input: CreateStatusUpdateInput): Promise<ActionResult<StatusUpdate>>` — Member; logs `status_update_posted`; notifies project watchers (`status_update`).
- `updateStatusUpdateAction(id: string, input: UpdateStatusUpdateInput): Promise<ActionResult<StatusUpdate>>` (logs `status_update_edited`), `deleteStatusUpdateAction(id: string): Promise<ActionResult>` (logs `status_update_deleted`) — author or admin.

`src/actions/risks.ts` (`updates-risks`)
- `createRiskAction(input: CreateRiskInput): Promise<ActionResult<Risk>>` (logs `risk_added`; notifies `risk_assigned` to the owner), `updateRiskAction(id: string, input: UpdateRiskInput): Promise<ActionResult<Risk>>` (logs `risk_updated`; notifies a new owner), `convertRiskToIssueAction(id: string): Promise<ActionResult<Risk>>` (logs `risk_converted`), `closeRiskAction(id: string): Promise<ActionResult<Risk>>` (logs `risk_closed`) — Member.
- `deleteRiskAction(id: string): Promise<ActionResult>` — creator, admin or project owner; logs `risk_deleted`.

`src/actions/evals.ts` (`evals-batches`)
- `createEvalRunAction(input: CreateEvalRunInput): Promise<ActionResult<EvalRun>>` (logs `eval_logged`), `updateEvalRunAction(id: string, input: UpdateEvalRunInput): Promise<ActionResult<EvalRun>>` (logs `eval_updated`), `deleteEvalRunAction(id: string): Promise<ActionResult>` (logs `eval_deleted`) — Member (delete: creator, admin or owner).
- `promoteChampionAction(id: string, input: { update_scorecard: boolean }): Promise<ActionResult<PromoteChampionResult>>` — Member; logs `champion_promoted`.

`src/actions/batches.ts` (`evals-batches`)
- `createBatchAction(input: CreateBatchInput): Promise<ActionResult<DataBatch>>` (logs `batch_added`), `updateBatchAction(id: string, input: UpdateBatchInput): Promise<ActionResult<DataBatch>>` (logs `batch_updated`), `deleteBatchAction(id: string): Promise<ActionResult>` (logs `batch_deleted`) — Member (delete: admin or owner).

### 18.4 W5

`src/actions/time.ts` (`time`)
- `getRunningTimerAction(): Promise<ActionResult<RunningTimer | null>>`.
- `startTimerAction(input: StartTimerInput): Promise<ActionResult<RunningTimer>>`, `stopTimerAction(): Promise<ActionResult<{ entry: TimeEntry; timer_id: string } | null>>`, `undoStopTimerAction(timerId: string): Promise<ActionResult<RunningTimer>>`, `discardTimerAction(): Promise<ActionResult>` — own timer only.
- `logTimeAction(input: LogTimeInput): Promise<ActionResult<TimeEntry>>` — Member, for themselves.
- `updateTimeEntryAction(id: string, input: UpdateTimeEntryInput): Promise<ActionResult<TimeEntry>>`, `deleteTimeEntryAction(id: string): Promise<ActionResult>` — entry owner or admin.
- `setTimesheetCellAction(input: TimesheetCellInput, userId?: string): Promise<ActionResult>` — self; another user's sheet requires Admin.
- `setUserCapacityAction(userId: string, hours: number): Promise<ActionResult>` — Admin. `setUserCostRateAction(userId: string, rate: number | null): Promise<ActionResult>` — Admin.
- Every write that adds minutes checks `crossedBudgetThreshold` and notifies `budget_threshold` (owner + admins, dedupe `budget:{projectId}:{threshold}:{period_start ?? "total"}`). Time entries and timers do not log activity (personal records, §23.1).

`src/actions/views.ts` (`productivity`)
- `createSavedViewAction(input: CreateSavedViewInput): Promise<ActionResult<SavedView>>`, `updateSavedViewAction(id: string, input: UpdateSavedViewInput): Promise<ActionResult<SavedView>>` (owner), `deleteSavedViewAction(id: string): Promise<ActionResult>` (owner or admin), `reorderSavedViewsAction(orderedIds: string[]): Promise<ActionResult>`.
- `toggleFavoriteAction(projectId: string): Promise<ActionResult<boolean>>`, `reorderFavoritesAction(orderedIds: string[]): Promise<ActionResult>`.

`src/actions/bulk.ts` (`productivity`)
- `bulkUpdateTasksAction(ids: string[], patch: BulkTaskPatch): Promise<ActionResult<BulkResult>>`, `bulkDeleteTasksAction(ids: string[]): Promise<ActionResult<BulkResult>>` (each task: admin, creator or project owner, else the whole call fails; after commit calls `deleteBlobs(result.blob_urls)` and returns the `BulkResult` part), `bulkUpdateProjectsAction(ids: string[], patch: BulkProjectPatch): Promise<ActionResult<BulkResult>>` — at most `MAX_BULK_IDS`; one summarising activity entry per project from `per_project` ("updated 7 tasks: status to Done" as `tasks_bulk_updated`, "deleted 3 tasks" as `tasks_bulk_deleted` with `meta.task_ids`, `project_updated` for project bulk edits); notifications grouped per recipient from the result: one "assigned 12 tasks" `assigned` notification to the new assignee built from `newly_assigned_ids` (who is also `autoSubscribe`d to those tasks), and `blocker_cleared` for the assignees of `listTasksBlockedBy(id)` for each id in `completed_ids`.

Reports and Home have no mutations (Home triggers `generateTimeBasedNotifications` and `pruneReadNotifications` from the server component).

## 19. Routes, API routes and navigation

### 19.1 Pages (all under `src/app/(app)/`, `requireUser()` via the layout; pages start with `PageHeader`)

| Route | Owner | NAV id (enabled by) | Notes |
|---|---|---|---|
| `/dashboard` | W5 `home` (W2 design restyles shell only) | `home` (on) | Label "Home". Bento (§23.5). |
| `/tasks` | W2 `tasks` | `my_tasks` (W2 integration) | My tasks: scope `?scope=assigned|created`, `?view=list|board`, groups Overdue/Today/This week/Later/No date (workspace today). `?assignee=<userId>` shows any active member's open tasks with the same grouping (title "Tasks for {name}"; `scope` is ignored when present) — the target of workload-heatmap and overdue-by-person links (`/tasks?assignee=<id>`) and of "reassign everything for someone on leave" (bulk select there). `?label=` (multi) and `?project=` narrow either mode (`listMyTasks(…, filters)`). |
| `/tasks/[key]` | W2 `tasks` | — | Canonical task page; `notFound()` for unknown keys; same sections as the drawer. |
| `/inbox` | W3 `notifications` | `inbox` (W3 integration) | Tabs `?tab=unread|mentions|all`; j/k/e keys; lazy notification generation + pruning on load. |
| `/projects` | W2 `commercial` | `projects` (on) | v1 + filters `client`, `service`, `engagement`, `health`, `label` (multi, URL). |
| `/projects/[id]` | W2 `delivery` | — | Tabs via `?tab=<ProjectTabId>` (default overview, unknown/hidden → overview), §21. Composer deep links: `?tab=updates&compose=1`, `?tab=risks&new=1`, `?tab=evals&new=1`. Risk heat-map filter: `?tab=risks&l=<1-5>&i=<1-5>` (likelihood, impact). |
| `/clients`, `/clients/[id]` | W2 `commercial` | `clients` (W2 integration) | Grid with search/industry/region filters; detail with engagements, hours, admin commercial summary per currency, activity of its projects. |
| `/calendar` | W3 `calendar` | `calendar` (W3 integration) | `?view=month|week&date=YYYY-MM-DD&scope=mine|all&project=&client=&label=`; agenda list below `sm`. |
| `/timeline` | W3 `timeline` | `timeline` (W3 integration) | `?zoom=week|month|quarter&client=&closed=1`; horizontal scroll inside its own container. |
| `/time` | W5 `time` | `time` (W5 integration) | Tabs `?tab=timesheet|entries`, `?week=YYYY-MM-DD`, admin `?user=`. |
| `/reports` | W5 `reports` | `reports` (W5 integration) | Tabs `?tab=delivery|time|team|commercial` (commercial admin-only, others get delivery); `?from&to&client`. |
| `/team` | W5 `time` (v1 page) | `team` (on) | Adds "This week" capacity % column; admin edits capacity and cost rate. |
| `/settings` | W2 `commercial` | `settings` (on) | Sections from the settings registry (§20.4). |

### 19.2 Route handlers (each one checks the session itself with `getCurrentUser()`; the middleware only checks that the cookie exists)

| Route | Owner | Contract |
|---|---|---|
| `GET /api/health` | v1 | unchanged |
| `POST /api/attachments/upload` | W3 `attachments` | `@vercel/blob/client` `handleUpload()`. Returns `501 { error }` when `BLOB_READ_WRITE_TOKEN` is unset, `401` without a session. `onBeforeGenerateToken`: project exists; pathname starts with `${ATTACHMENT_PATH_PREFIX}${projectId}/`; `allowedContentTypes = ALLOWED_UPLOAD_CONTENT_TYPES`; `maximumSizeInBytes = MAX_UPLOAD_BYTES`; `addRandomSuffix: true`. Does not rely on `onUploadCompleted` (never fires on localhost): the client calls `createFileAttachmentAction` after `upload()` resolves. |
| `GET /api/export/time` | W5 `time` | CSV (`toCsv`) of time entries for `?from&to&user&project&client`; members get their own entries only, admins any user; `Content-Disposition: attachment; filename="time-<from>-<to>.csv"`. |
| `GET /api/export/projects` | W5 `reports` | CSV of projects; commercial columns only for admins. |
| `GET /api/export/tasks` | W5 `reports` | CSV of tasks for the `TaskFilters` in the query string. |

### 19.3 Navigation (`src/lib/constants.ts`)

`NAV_GROUPS` (Workspace, Delivery, Insights, Admin) and `NAV_CONFIG` hold every item with `href`, `label`, `icon: IconName`, `group`, `order`, `enabled`, optional `shortcut` ("g x") and `adminOnly`. The sidebar renders `navSections(user.role === "admin")` (enabled items only, grouped and ordered); the active state is `isNavActive(pathname, href)`. When a workflow ships a page, its integration agent flips that item's `enabled` to `true` — a one-line change; nothing else edits `NAV_CONFIG`. Shortcuts of disabled items are inactive. Currently enabled: Home (`/dashboard`), Projects, Team, Settings. `NAV_ITEMS` remains exported (deprecated) until the design agent moves the sidebar to `navSections`.

## 20. Shared component contracts

Client components are marked (client). All accept `className` unless noted. Every interactive control has an accessible name; colour-coded states always show a label or icon (§23.6).

**Never pass functions or render props from a server component to a client component** ("Functions cannot be passed directly to Client Components"). Tab components, overview cards and pages are server components: they pass serialisable data only. Callback props (`onSelect`, `onChange`, `startStep`, `detailsAside`, ...) are for client parents; when a server surface needs interactivity it renders a client wrapper that owns the state, uses URL state (links / search params), or renders a client slot file (e.g. `GateActionSlot`).

### 20.1 UI kit additions (`src/components/ui/*`, W2 `design`)

- `icon.tsx`: `ICONS: Record<IconName, LucideIcon>`; `Icon({ name: IconName; className?; "aria-hidden"?: boolean; label?: string })` (with `label`: `role="img"` + `aria-label`).
- `tabs.tsx` (client, radix Tabs): `Tabs({ value?; defaultValue?; onValueChange?; children; className? })`, `TabsList({ children; "aria-label": string; className? })` (horizontal scroll on phones, no wrapping), `TabsTrigger({ value; children; icon?: IconName; count?: number | null; className? })`, `TabsContent({ value; children; className? })`. Plus `TabLinks({ items: { id: string; label: string; href: string; icon?: IconName; count?: number | null }[]; activeId: string; "aria-label": string; className? })` — the same look rendered as `Link`s with `aria-current="page"` (server-friendly, used by the project page).
- `switch.tsx` (client, radix Switch): `Switch({ checked; onCheckedChange: (checked: boolean) => void; disabled?; id?; "aria-label"?: string; className? })`.
- `sheet.tsx` (client, radix Dialog): `Sheet({ open?; onOpenChange?; children })`, `SheetTrigger`, `SheetClose`, `SheetContent({ title: string; description?: string; children; headerActions?: ReactNode; footer?: ReactNode; size?: "md" | "lg"; className? })` — right drawer from `sm` (`md` = 520px, `lg` = 720px; slides in 280ms with `--ease-drawer`), bottom sheet below `sm` (`max-h-[90dvh]`, safe-area padded); glass header; body scrolls.
- `progress-ring.tsx`: `ProgressRing({ value: number /* 0-100 */; size?: number /* px, default 40 */; strokeWidth?: number; tone?: "accent" | "success" | "warning" | "danger"; showValue?: boolean; label: string /* accessible name */; className? })` — `role="progressbar"`, animates `stroke-dashoffset` 600ms on first view, static when motion is reduced.
- `number-ticker.tsx` (client): `NumberTicker({ value: number; format?: Intl.NumberFormatOptions; locale?: string; prefix?: string; suffix?: string; className? })` — `@number-flow/react`, `tabular-nums`, jumps without animation when motion is reduced.
- `kbd.tsx`: `Kbd({ keys: string /* "mod+k", "g h", "?" */; className? })` — renders "Ctrl" on the server and swaps to "⌘" on macOS after mount.
- `rag-dot.tsx`: `RagDot({ health: RagHealth | null; showLabel?: boolean; size?: "sm" | "md"; className? })` — dot + label from `RAG_CONFIG` (sr-only when `showLabel` is false); null = grey "No update".
- `money.tsx`: `Money({ amount: number | null; currency: Currency; compact?: boolean; className? })` (`formatMoney`, `tabular-nums`, full value in `title` when compact) and `MoneyTotals({ totals: CurrencyTotals; compact?: boolean; className? })` (one item per currency, never summed).
- `spotlight-card.tsx` (client): `SpotlightCard({ children; as?: "div" | "section" | "article" | "li"; className?; ...rest native props })` — pointer-follow highlight via `--x`/`--y` (no React state), only for `(hover:hover) and (pointer:fine)`.
- `user-picker.tsx` (client): `UserPicker({ users: UserSummary[]; value: string | null; onChange: (id: string | null) => void; allowUnassigned?: boolean; placeholder?: string; trigger?: ReactNode; align?: "start" | "center" | "end"; disabled?: boolean; "aria-label": string })` — searchable popover list with avatars, keyboard navigable.
- `skeleton.tsx` keeps `Skeleton({ className })` (shimmer, static when reduced); every v1 export of §9 keeps its props.

Motion helpers (`src/components/motion/*`, W2 `design`, all client): `MotionProvider({ children })` (LazyMotion strict + `domAnimation`, `MotionConfig reducedMotion` from `data-motion`: "user" for system, "always" for reduce, "never" for full), `Reveal({ children; delay?: number; y?: number; as?; className? })`, `Stagger({ children; as?; className? })` + `StaggerItem({ children; as?; className? })` (35ms step, max 8 items, first mount only), `AuroraBackground()`, `ParticlesCanvas({ className? })` (auth only), `TextShine({ children; as?; className? })`.

### 20.2 Domain components

W2 `tasks` (`src/components/tasks/*`)
- `ProjectTasksTab(props: ProjectTabProps)` — server; board/list toggle `?view=board|list` (default board), filters `?assignee&label&milestone`.
- `TaskBoard({ tasks: TaskWithMeta[]; projectId?: string; users: UserSummary[]; milestones?: MilestoneRef[]; showProject?: boolean; today: string })` (client) — columns `TASK_BOARD_COLUMNS` (cancelled collapsed), dnd-kit with optimistic `moveTaskAction` and revert + toast on failure; `KeyboardSensor` with `sortableKeyboardCoordinates` plus a status menu on every card (keyboard alternatives); `accessibility.announcements` name the task key and title; quick add at each column foot when `projectId` is set; motion on an inner wrapper, never on the sortable node; every card carries `data-list-item-id={task.id}` and is focusable (for `useListNavigation`, W3).
- `TaskList({ tasks: TaskWithMeta[]; users: UserSummary[]; groupBy?: "milestone" | "status" | "due" | "none"; milestones?: MilestoneRef[]; showProject?: boolean; selectable?: boolean; selectedIds?: string[]; onSelectionChange?: (ids: string[]) => void; today: string })` (client) — inline status/assignee/due editors; selection props are for W5 bulk actions (checkbox column, shift-click range, Ctrl/Cmd+A); every row carries `data-list-item-id={task.id}` and a focusable row element. Server pages that need selection render it inside a client wrapper (W5 bulk).
- `TaskRow({ task: TaskWithMeta; users: UserSummary[]; showProject?: boolean; selectable?: boolean; selected?: boolean; onSelectedChange?: (selected: boolean, shiftKey: boolean) => void; today: string })` (client).
- `TaskCard({ task: TaskWithMeta; today: string; showProject?: boolean })` — mono key, title, `LabelChips max=3`, assignee, due chip (red when overdue in workspace time), checklist n/m, Blocked/Deliverable badges.
- `TaskQuickAdd({ projectId: string; status?: TaskStatus; milestoneId?: string | null; placeholder?: string; onCreated?: (task: TaskWithMeta) => void })` (client) — Enter creates and keeps focus.
- `TaskStatusMenu({ taskId: string; status: TaskStatus; trigger?: ReactNode })` (client).
- `TaskDrawer({ taskKey: string | null; onOpenChange: (open: boolean) => void; users: UserSummary[]; viewerId: string; isAdmin: boolean; today: string; blobEnabled: boolean })` (client) — `Sheet` 520px; loads `getTaskDetailAction(taskKey)`; renders the drawer sections registry (§21.3), passing `blobEnabled` through; milestone picker options from `listMilestoneRefsAction`, blocked-by picker from `searchTaskRefsAction`.
- `TaskDrawerHost({ users: UserSummary[]; viewerId: string; isAdmin: boolean; today: string; blobEnabled: boolean })` (client) — opens `TaskDrawer` for `?task=PRX-n` in the current URL and removes the param on close; any link can open a task with `?task=<key>`.
- `NewTaskDialogHost({ users: UserSummary[]; projects: ProjectSummary[] })` (client) — handles the `new-task` AppCommand (prefills project/status/due date/milestone; milestone options via `listMilestoneRefsAction` for the chosen project).
- `TaskChecklist({ taskId: string; items: TaskChecklistItem[] })` (client) — drag reorder plus "Move up" / "Move down" menu items calling `reorderChecklistAction`.

W2 `delivery` (`src/components/milestones/*`, `src/components/projects/detail/*`)
- `PhaseStepper({ milestones: MilestoneWithMeta[]; projectId: string; selectedId?: string | null; onSelect?: (id: string) => void; canDecideGate: boolean })` (client) — horizontal track (scrolls on phones), node = status dot, name, dates, mini `ProgressRing`; active node pulses softly; gate_review nodes get the amber/conic ring; diamonds for point milestones; for `gate_review` nodes renders `<GateActionSlot milestone={m} projectId={projectId} />` when `canDecideGate`.
- `PhasePanel({ milestoneId: string; projectId: string; isAdmin: boolean; canEdit: boolean; canDecideGate: boolean })` (client) — loads `getMilestonePanelAction`; tasks, deliverables checklist, gate box (fields display, "Decision history", "Request gate review", and `GateActionSlot` when the phase is in `gate_review` and `canDecideGate`), price/invoice for admins.
- `PhasesCard(props: ProjectTabProps)` — the phases overview card: a server component that loads `listMilestones(project.id, { includeCommercial: isAdmin })` and renders a client `PhasesPanel({ milestones; projectId; isAdmin; canEdit; canDecideGate })` that owns the selected-phase state and renders `PhaseStepper` + `PhasePanel`. `canDecideGate = isAdmin || project.owner_id === viewer.id`, computed on the server.
- `GateActionSlot({ milestone: MilestoneWithMeta; projectId: string })` (client, `src/components/milestones/gate-action-slot.tsx`) — returns `null` in W2; W4 integration changes only this file to return `<GateDialog milestoneId={milestone.id} trigger={…} />`.
- `MilestoneManagerDialog({ projectId: string; milestones: MilestoneWithMeta[]; isAdmin: boolean; trigger: ReactNode })` (client) — sortable rows (dnd-kit `KeyboardSensor` + Move up/down menu items), kind toggle, dates, gate flag, admin price/invoice (price disabled with a hint while the project has no currency).
- `DeliverablesChecklist({ deliverables: TaskWithMeta[] })`, `GateFields({ milestone: MilestoneWithMeta; history: Activity[] })` (history rendered as "Decision history": who decided what, when, sign-off and evidence link).
- `ProjectHeader` (delivery-internal), `ProjectTabsNav` (uses `TabLinks`).

W2 `commercial`
- `ProjectDialog` (§12 props, all v1 props unchanged) plus optional `defaults?: Partial<CreateProjectFullInput>`, `startStep?: (api: { next: (prefill: Partial<CreateProjectFullInput>) => void }) => ReactNode` (renders first when given; `next` moves to the details form with the prefill), `createAction?: (input: CreateProjectFullInput) => Promise<ActionResult<{ id: string }>>` (defaults to `createProjectAction`), `detailsAside?: (values: Partial<CreateProjectFullInput>) => ReactNode` (rendered below the start and due date fields with the live form values; templates use it for the computed phase-date preview and to fill an empty due date from `build_end_date`). Loads `getProjectFormOptionsAction()` when opened; shows client, service line, engagement type, delivery state, currency, budget hours/period, labels (`LabelPicker`), progress mode, and for admins contract value and hourly rate (`parseMoneyInput`; amounts need a currency, the form says so). Never shows go-live date or tuning days (`setGoLiveDate` owns them). Non-admins never send commercial keys.
- `NewProjectDialogHost({ users: UserSummary[] })` (client) — handles the `new-project` AppCommand with `ProjectDialog`.
- `ProjectCard({ project: ProjectWithMeta; compact?: boolean; workspace?: WorkspaceDateContext; className? })` — v1 content plus `ClientChip`, `ServiceLineBadge iconOnly`, `RagDot` (health), an "Update due" badge when `workspace` is given and `isUpdateDue(project, workspace.today, workspace.cadenceDays, workspace.timeZone)`, a `current_phase` chip, `LabelChips max=3`, and `task_done_count/task_count` when `progress_mode = 'tasks'`; `DueDate` gets `today={workspace?.today}`. ProjectList rows and ProjectBoard cards show the same set, and both take `workspace?: WorkspaceDateContext` (pages pass `{ today, timeZone, cadenceDays }`).
- `ProjectList` also gains `selectable?: boolean; selectedIds?: string[]; onSelectionChange?: (ids: string[]) => void` (same semantics as `TaskList`; W5 bulk wires them), and every row carries `data-list-item-id={project.id}` with a focusable row element.
- `DueDate({ date, status, className?, withIcon?, today?: string, closed?: boolean })` — with `today` it uses `isOverdueOn(date, today, closed ?? status is completed/cancelled)` and `daysUntilOn`; without it the v1 behaviour stays. Every v2 caller passes the workspace today.
- `LabelPicker({ labels: LabelSummary[]; value: string[]; onChange: (ids: string[]) => void; allowCreate?: boolean; trigger?: ReactNode; align?: "start" | "center" | "end"; "aria-label"?: string })` (client) — search, grouped Tech/Domain/General, inline "Create "x"" (`createLabelAction`), multi-select.
- `LabelChips({ labels: LabelSummary[]; max?: number /* default 3, then "+N" */; size?: "sm" | "md" })`.
- `ClientDialog({ mode: "create" | "edit"; client?: Client; trigger: ReactNode; onSuccess?: (id: string) => void })` (client), `NewClientDialogHost()` (client, `new-client` AppCommand), `ClientChip({ client: ClientSummary })` (colour + code; confidential shows a lock icon with label), `ServiceLineBadge({ value: ServiceLine; iconOnly?: boolean })`, `ClientCard({ client: ClientWithMeta; isAdmin: boolean })`.
- `CommercialSummary(props: ProjectTabProps)` — server overview card, admin-only (contract value, hourly rate, phase prices by invoice status per currency). It shows contract figures only until W5 integration adds the approximate margin from `getProjectMargin` (project and per phase, labelled approximate).
- `ProjectFiltersBar` lives in `projects-toolbar.tsx` (v1 contract) with the v2 filters.

W3 `notifications`: `NotificationBell({ initialUnread: number })` (client; polls `getUnreadCountAction` every `NOTIFICATION_POLL_MS` while visible, on focus and after mutations; badge caps at 99+, pops and wiggles once on increase; glass popover with the latest `NOTIFICATION_POPOVER_LIMIT` grouped Today/Earlier and "Mark all read"); `MentionTextarea({ value: string; onChange: (value: string) => void; users: UserSummary[]; onSubmit?: () => void; placeholder?: string; disabled?: boolean; id?: string; rows?: number; invalid?: boolean; "aria-label"?: string })` (client; drop-in for `Textarea`; "@" opens a user listbox with arrow keys/Enter; inserts `mentionToken`; Cmd/Ctrl+Enter calls `onSubmit`); `MentionText({ body: string })` (renders `splitMentions` with accent chips); `WatchButton({ entity: WatchEntity; initialWatching: boolean })` (client); `InboxList` (page-internal).

W3 `attachments`: `FilesTab(props: ProjectTabProps)` (server; list/grid, thumbnails for images, uploader, size; drop zone + per-file progress when Blob is enabled, otherwise links only with an admin hint; confidential-client note); `KeyLinksCard(props: ProjectTabProps)` (server overview card; pill buttons per pinned link type + add-link popover); `TaskAttachmentsSection(props: TaskDrawerSectionProps)` (client drawer section); `AttachButton({ projectId: string; taskId?: string | null; blobEnabled: boolean; onAdded?: (attachment: Attachment) => void })` (client, paperclip for composers).

W3 `search`: `CommandMenuTrigger()` (client; topbar button "Search… Ctrl K", ⌘ on macOS); `CommandPalette({ users: UserSummary[]; savedViews?: SavedView[] })` (client; cmdk `<Command>` inside the existing `Dialog` with an sr-only title "Command menu"; groups Recent, Navigate (from `navSections`), Actions and project-context actions (both from `PALETTE_ACTIONS`, project ones only on `/projects/[id]` with that `projectId`), then Projects, Tasks, Clients, People, Comments, and Saved views when `savedViews` is given (links to `SAVED_VIEW_SCOPE_CONFIG[scope].href` + the view's filters); 150ms debounce; recent items in `localStorage[STORAGE_KEYS.recent]`, try/catch). **Palette action registry** `src/components/command/registry.ts`: `export interface PaletteAction { id: string; label: string; icon: IconName; group: "actions" | "project"; keys?: string; keywords?: string[]; command?: AppCommand | ((ctx: { projectId?: string }) => AppCommand); href?: (ctx: { projectId: string }) => string; run?: () => void }` (exactly one of `command` / `href` / `run`) and `export const PALETTE_ACTIONS: readonly PaletteAction[]`. W3 ships New task, New project, New client, Toggle theme (`run`), Keyboard shortcuts, and the project action New task here; W4 integration appends Post update (`?tab=updates&compose=1`), Add risk (`?tab=risks&new=1`) and Log eval run (`?tab=evals&new=1`); W5 integration appends Start/stop timer (id `toggle-timer`) and Log time — one entry each, never editing `command-palette.tsx`. `ShortcutsHelp()` (client; "?" and the `open-shortcuts` command; lists `SHORTCUTS` + NAV shortcuts with `Kbd`); `GlobalHotkeys()` (client; binds `SHORTCUTS` and NAV "g x" sequences to router pushes and AppCommands; binds `t` only while `PALETTE_ACTIONS` contains `toggle-timer`). Hook `src/hooks/use-list-navigation.ts`: `useListNavigation({ itemIds: string[]; onOpen: (id: string) => void; onToggleSelect?: (id: string) => void; onStatusMenu?: (id: string) => void; onAssignMe?: (id: string) => void })` — j/k move a roving tabindex over elements with `data-list-item-id`, x/Enter/s/a call the handlers, changes are announced through an `aria-live="polite"` region; built on `useHotkeys`, inactive while focus is in an input or a dialog is open. Hook `src/hooks/use-hotkeys.ts`: `useHotkeys(bindings: HotkeyBinding[], options?: { enabled?: boolean })` with `interface HotkeyBinding { keys: string; handler: (event: KeyboardEvent) => void; allowInInputs?: boolean; allowInDialogs?: boolean }` — supports "mod+k", "shift+c", "?" and two-key sequences within `SHORTCUT_SEQUENCE_MS`; ignores events from inputs/textareas/selects/contenteditable and while a dialog is open unless allowed.

W3 `calendar`: page-internal components only. W3 `timeline`: `TimelineGrid({ rows: TimelineGridRow[]; range: { start: string; end: string }; zoom: "week" | "month" | "quarter"; today: string; groupLabels?: boolean })` (client engine; sticky label column 240px / 140px on phones; 32/10/3 px per day; scaleX bar entry; weekend shading at week zoom; today line; tuning window hatched) where `TimelineGridRow = { id: string; label: string; sublabel?: string; href?: string; color: string | null; indent?: number; bar: { start: string; end: string; progress?: number } | null; segments?: { id: string; label: string; start: string; end: string; status: MilestoneStatus }[]; markers?: { id: string; date: string; kind: "milestone" | "gate" | "go_live"; label: string }[]; tuning?: { start: string; end: string } | null; health?: RagHealth | null; groupId?: string }`; `ProjectTimelineTab(props: ProjectTabProps)` (server).

W4: `TemplatePicker({ options: TemplateOption[]; value: string | null; onChange: (key: string | null) => void; startDate: string })` (client; cards with service-line icon, phase chips, `duration_label`, "Blank project" = null); `NewProjectWithTemplate({ users: UserSummary[]; trigger?: ReactNode; today: string })` (client wrapper passing `startStep`, `createAction` and `detailsAside={(v) => <TemplateSchedulePreview payload={payload} startDate={v.start_date ?? today} />}` to `ProjectDialog`; the preview uses `computeTemplateSchedule` and fills an empty due date from `build_end_date`); `SaveAsTemplateDialog`, `ConvertToPilotButton({ project: ProjectWithMeta })`, `ProposeRetainerButton({ project: ProjectWithMeta })`, `TemplatesSettingsSection({ user: User })`; `ScorecardCard(props: ProjectTabProps)`, `MetricDialog`, `GateDialog({ milestoneId: string; trigger: ReactNode })` (client; loads `getGateReviewAction`; deliverables, scorecard met/not met, champion run, open high risks, Go / Extend once / Stop radio cards, fix list + new date for Extend, client sign-off, evidence URL, confirm step); `TuningCard(props: ProjectTabProps)` (go-live card: "Set go-live date" before go-live; afterwards countdown ring, end date, handover progress (scale-phase deliverables), Close tuning, Propose retainer within `TUNING_ALERT_DAYS`); `StatusUpdatesTab(props: ProjectTabProps)`, `LatestUpdateCard(props: ProjectTabProps)`, `formatClientUpdate(update: StatusUpdate, project: { name: string; client: ClientSummary | null }): string` (pure, `src/components/updates/format-client-update.ts`; excludes `budget_rag` and `internal_notes`); `RisksTab(props: ProjectTabProps)` (reads `?l=&i=` from `searchParams` to filter the table), `TopRisksCard(props: ProjectTabProps)`, `RiskHeatmap({ cells: RiskHeatCell[]; selected?: { likelihood: number; impact: number } | null; linkBase?: string; onSelect?: (cell: { likelihood: number; impact: number } | null) => void })` — from the server `RisksTab` pass `linkBase="/projects/{id}?tab=risks"`: cells render as `Link`s to `${linkBase}&l=<likelihood>&i=<impact>` (the selected cell links back to `linkBase` to clear); `onSelect` is for client callers only; `EvalsTab(props: ProjectTabProps)`, `MetricTrendChart` (hand-rolled SVG); `BatchesTab(props: ProjectTabProps)`.

W5: `TimerPill({ initialTimer: RunningTimer | null; projects: ProjectSummary[] })` (client; idle "Start timer" popover with project/task picker and note; running shows live mm:ss with a pulsing dot; stop creates the entry and toasts with Undo; handles the `toggle-timer` command); `LogTimeDialog({ open: boolean; onOpenChange: (open: boolean) => void; projects: ProjectSummary[]; defaultProjectId?: string; defaultTaskId?: string | null; today: string })` (client; date, `parseDuration` input, billable `Switch`, note); `LogTimeDialogHost({ projects: ProjectSummary[]; today: string })` (client; `log-time` command); `TaskTimeSection(props: TaskDrawerSectionProps)` (Start timer / Log time / logged list); `ProjectTimeTab(props: ProjectTabProps)`; `BudgetBurnBar({ burn: BudgetBurn })` (scaleX fill coloured at 75/90/100, elapsed marker, "Running hot" badge); `BudgetCard(props: ProjectTabProps)`; reports charts (recharts via `next/dynamic`, CSS-variable colours, labels + colour, `tabular-nums`); `WorkloadHeatmap({ rows: WorkloadRow[] })`; `BulkActionBar({ kind: "tasks" | "projects"; selectedIds: string[]; onClear: () => void; users: UserSummary[]; labels: LabelSummary[]; milestones?: MilestoneRef[] })` (client; glass bar sliding up 12px; Esc clears); `SaveViewButton({ scope: SavedViewScope; filters: SavedViewFilters; isDefault: boolean })`; `FavoriteToggle({ projectId: string; initial: boolean })`; `FavoritesSection({ favorites: FavoriteProject[] })` and `ViewsSection({ views: SavedView[] })` (sidebar; favourites and views reorder by drag with "Move up" / "Move down" menu items); Home bento tiles. W5 `time` builds `getProjectMargin` and shows the per-phase margin in `ProjectTimeTab` for admins only; W5 integration renders it in `CommercialSummary` (project + per phase, "approximate").

### 20.3 App shell slots (files created by W2 `design`; entries added only by integration agents)

- `src/components/layout/topbar-actions.tsx` — `TopbarActions({ user }: { user: User })`, an async server component rendering the right-hand topbar controls in a flex row. W3 integration adds `CommandMenuTrigger` and `NotificationBell` (initial count from `countUnread`); W5 integration adds `TimerPill` (initial timer + project summaries).
- `src/components/layout/sidebar-extra.tsx` — `SidebarExtra({ user }: { user: User })`, async server component rendered under the NAV groups. W5 integration adds `FavoritesSection` and `ViewsSection`.
- `src/components/layout/global-overlays.tsx` — `GlobalOverlays({ user }: { user: User })`, async server component rendered once inside the app shell. W2 integration adds `TaskDrawerHost` (`blobEnabled={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}`, swapped to `isBlobEnabled()` by W3 integration), `NewTaskDialogHost`, `NewProjectDialogHost` (`users` from `listUserSummaries()`), `NewClientDialogHost`; W3 integration adds `CommandPalette`, `ShortcutsHelp`, `GlobalHotkeys`; W5 integration adds `LogTimeDialogHost` and passes `savedViews={await listSavedViews(user.id)}` to `CommandPalette`.
- `AppShell({ user; children; topbarActions?: ReactNode; sidebarExtra?: ReactNode; overlays?: ReactNode })`; `src/app/(app)/layout.tsx` passes `<TopbarActions user={user} />`, `<SidebarExtra user={user} />`, `<GlobalOverlays user={user} />`.

### 20.4 Settings sections registry (`src/components/settings/registry.ts`, W2 `commercial`)

`interface SettingsSectionEntry { id: string; title: string; description: string; order: number; adminOnly?: boolean; component: ComponentType<{ user: User }> }` and `export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[]`. The settings page renders entries sorted by `order` (filtering `adminOnly` for members) inside `SettingsSection`. Initial entries: profile (0), password (10), appearance (20, design's `AppearanceCard`: Theme, Motion, Transparency), workspace (30, admin: timezone, USD→INR rate, default tuning days, update cadence), labels (40; members create, admins rename/recolour/delete). W4 integration adds templates (50).

## 21. Registries for the project page and the task drawer

### 21.1 Project tab registry (`src/components/projects/detail/tabs/`, W2 `delivery`)

`types.ts`:
```ts
export interface ProjectTabContext {
  /** Loaded with includeCommercial = isAdmin. */
  project: ProjectWithMeta;
  viewer: User;
  isAdmin: boolean;
  counts: ProjectTabCounts;
}
export interface ProjectTabProps extends ProjectTabContext {
  users: UserSummary[];
  /** Workspace today. */
  today: string;
  /** The page's awaited searchParams. */
  searchParams: Record<string, string | string[] | undefined>;
}
export interface ProjectTabEntry {
  id: ProjectTabId;
  /** Server or client component; async server components load their own data. */
  component: ComponentType<ProjectTabProps>;
  /** Default: always visible. */
  visible?: (ctx: ProjectTabContext) => boolean;
  /** Badge next to the label (null = none). */
  badge?: (ctx: ProjectTabContext) => number | null;
}
```
`registry.ts` exports `PROJECT_TABS: readonly ProjectTabEntry[]` and `visibleProjectTabs(ctx: ProjectTabContext): (ProjectTabEntry & { label: string; icon: IconName; order: number })[]` (joins `PROJECT_TAB_CONFIG`, drops hidden tabs, sorts by `order`). Label, icon and order come from `PROJECT_TAB_CONFIG`, so **adding a tab is one entry** `{ id, component, visible? }`. A tab without a registered entry does not exist in the UI. The page renders only the active tab's component (so only its data loads), with `TabLinks` navigation; unknown or hidden `?tab=` values fall back to overview.

Entries and who registers them: overview + activity (W2 delivery), tasks (W2 integration → `ProjectTasksTab`), timeline + files (W3 integration → `ProjectTimelineTab`, `FilesTab`), updates + risks + evals + batches (W4 integration → `StatusUpdatesTab`, `RisksTab`, `EvalsTab`, `BatchesTab`), time (W5 integration → `ProjectTimeTab`). Visibility: evals when `EVAL_SERVICE_LINES.includes(service_line)` or `counts.eval_runs > 0`; batches when `BATCH_SERVICE_LINES.includes(service_line)`, `progress_mode === "batches"` or `counts.batches > 0`; all others always. Badges: tasks → `counts.tasks`, risks → `counts.open_risks`.

### 21.2 Overview cards registry (`src/components/projects/detail/overview/registry.ts`, W2 `delivery`)

`interface OverviewCardEntry { id: string; column: "main" | "side"; order: number; component: ComponentType<ProjectTabProps>; visible?: (ctx: ProjectTabContext) => boolean }` and `export const OVERVIEW_CARDS: readonly OverviewCardEntry[]`. The overview tab renders visible cards per column by `order` (one column below `xl`: main then side). Initial (delivery): description (main 0), phases (main 10, `PhaseStepper` + `PhasePanel`), sub-projects (main 30), comments (main 90), details (side 0). Integration additions: key links (main 5, W3), scorecard (main 20, W4), latest update (side 10, W4), go-live/tuning (side 20, W4; `visible: ({ project: p }) => p.go_live_date !== null || p.service_line === null || !NO_GO_LIVE_SERVICE_LINES.includes(p.service_line)`, so any build project can reach "Set go-live date" without a template), top risks (side 30, W4), commercial (side 40, W2 integration; `visible: ctx => ctx.isAdmin`), budget (side 50, W5; visible when `budget_hours` is set). The phases card is `PhasesCard` (server, §20.2), which passes only serialisable props to its client `PhasesPanel`; gate decisions plug in through `GateActionSlot`: the W4 integration agent edits only `src/components/milestones/gate-action-slot.tsx` to return `<GateDialog milestoneId={milestone.id} trigger={…} />` (it renders only where `canDecideGate`, i.e. admin or project owner).

### 21.3 Task drawer sections registry (`src/components/tasks/drawer-sections.tsx`, W2 `tasks`)

`interface TaskDrawerSectionProps { task: TaskDetail; users: UserSummary[]; viewerId: string; isAdmin: boolean; today: string; blobEnabled: boolean; onChanged: () => void /* reloads the drawer */ }`, `interface TaskDrawerSectionEntry { id: string; title: string; order: number; component: ComponentType<TaskDrawerSectionProps> }` (client components) and `export const TASK_DRAWER_SECTIONS: readonly TaskDrawerSectionEntry[]`. Initial (tasks): properties (0), description (10), checklist (20), subtasks (30), blocked by (40), deliverable approval (50, shown for deliverables), comments (70), activity (90, renders `task.activity`). W3 integration adds attachments (60) and swaps the comment composer to `MentionTextarea`; W5 integration adds time (65).

## 22. File ownership map

Exactly one owner per file per workflow. "Integration" = the workflow's integration agent. Paths ending in `/**` include new files the owner creates there. Files not listed are frozen for every agent (except W6): `src/lib/auth.ts`, `src/lib/password.ts`, `src/lib/data/sessions.ts`, `src/lib/data/users.ts`, `src/middleware.ts`, `src/actions/auth.ts`, `src/actions/users.ts`, `scripts/dev-local.mjs`, `scripts/migrate.ts`, `next.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `postcss.config.mjs`.

### W1 `foundation` (done)
`package.json`, `package-lock.json` (library install only); `src/lib/db.ts` (SCHEMA only); `src/lib/types.ts`; `src/lib/constants.ts`; `src/lib/utils.ts` (additions); `src/lib/money.ts`, `src/lib/duration.ts`, `src/lib/workspace-time.ts`, `src/lib/templates.ts` (new); `SPEC.md`; conformance edits so the build stays green with the new types: `src/lib/data/projects.ts` (read side + stripping), `src/lib/data/users.ts`, `src/lib/data/comments.ts`, `src/lib/data/activity.ts` (§17.1).

### W2
- `design`: `src/app/globals.css`; `src/app/layout.tsx`; `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`; `src/app/(app)/layout.tsx`, `src/app/(app)/template.tsx` (new), `src/app/(app)/loading.tsx`; `src/app/(auth)/**`; `src/components/auth/**`; `src/components/motion/**` (new); `src/components/ui/**` (every primitive, existing and new); `src/components/layout/**` (incl. new `topbar-actions.tsx`, `sidebar-extra.tsx`, `global-overlays.tsx`, which design creates as empty slots); `src/components/settings/appearance-card.tsx`.
- `tasks`: `src/lib/data/tasks.ts` (new), `src/lib/data/comments.ts`, `src/lib/data/activity.ts`; `src/actions/tasks.ts` (new), `src/actions/comments.ts`; `src/lib/schemas/tasks.ts`; `src/components/tasks/**`; `src/app/(app)/tasks/**`.
- `delivery`: `src/lib/data/milestones.ts`, `src/lib/data/project-detail.ts` (new); `src/actions/milestones.ts`; `src/lib/schemas/milestones.ts`; `src/components/milestones/**` (incl. `gate-action-slot.tsx`, created returning `null`); `src/components/projects/detail/**` (incl. `tabs/`, `overview/`, activity feed, comments section, details panel (shows client, service line, engagement type, delivery state, budget hours, progress mode — never contract value), members editor, progress editor (shows the active `progress_mode`; manual only), project actions, tree, delete dialog); `src/app/(app)/projects/[id]/**`.
- `commercial`: `src/lib/data/clients.ts`, `src/lib/data/labels.ts`, `src/lib/data/app-settings.ts` (new), `src/lib/data/projects.ts`; `src/actions/clients.ts`, `src/actions/labels.ts`, `src/actions/app-settings.ts` (new), `src/actions/projects.ts`; `src/lib/schemas/{clients,labels,app-settings}.ts`; `src/lib/validation.ts`; `src/components/clients/**`, `src/components/labels/**`; `src/components/projects/{project-dialog.tsx, new-project-dialog-host.tsx, projects-toolbar.tsx, project-filters.ts, project-list.tsx, project-card.tsx, project-board.tsx, board-layout.ts, status-badge.tsx, priority-badge.tsx, due-date.tsx, status-select.tsx}`; `src/app/(app)/projects/page.tsx`, `src/app/(app)/projects/loading.tsx`; `src/app/(app)/clients/**`; `src/app/(app)/settings/**`; `src/components/settings/**` except `appearance-card.tsx` (incl. `registry.ts`).
- `w2-integration`: `src/lib/constants.ts` (enable `my_tasks`, `clients`); `src/components/layout/global-overlays.tsx` (TaskDrawerHost with `blobEnabled`, NewTaskDialogHost, NewProjectDialogHost with `users`, NewClientDialogHost); `src/components/projects/detail/tabs/registry.ts` (tasks tab); `src/components/projects/detail/overview/registry.ts` (commercial card); cross-agent import fixes in W2-owned files; final tsc/lint/bootstrap check.

### W3
- `notifications`: `src/lib/data/notifications.ts`; `src/actions/notifications.ts`; `src/lib/schemas/notifications.ts`; `src/components/notifications/**`; `src/app/(app)/inbox/**`; plus the notify()/autoSubscribe() calls (and nothing else) inside `src/actions/{tasks,comments,milestones,projects}.ts`: assigned, comment (watchers), mention, task_status (watchers), blocker_cleared, gate_review (`requestGateReviewAction` → owner + admins); auto-subscribe project owner/members/creator on project create/update and task creator/assignee/commenters. Watcher reads use the explicit ∪ implicit − muted rule (§17.5).
- `attachments`: `src/lib/data/attachments.ts`; `src/actions/attachments.ts`; `src/lib/schemas/attachments.ts`; `src/app/api/attachments/upload/route.ts`; `src/components/attachments/**`; `.env.example` (document optional `BLOB_READ_WRITE_TOKEN`).
- `search`: `src/lib/data/search.ts`; `src/actions/search.ts`; `src/lib/schemas/search.ts`; `src/components/command/**` (incl. `registry.ts`); `src/hooks/use-hotkeys.ts`, `src/hooks/use-list-navigation.ts`.
- `calendar`: `src/lib/data/calendar.ts`; `src/app/(app)/calendar/**`; `src/components/calendar/**`.
- `timeline`: `src/lib/data/timeline.ts`; `src/app/(app)/timeline/**`; `src/components/timeline/**`.
- `w3-integration`: `src/lib/constants.ts` (enable `inbox`, `calendar`, `timeline`); `topbar-actions.tsx` (CommandMenuTrigger, NotificationBell); `global-overlays.tsx` (CommandPalette, ShortcutsHelp, GlobalHotkeys); tab registry (timeline, files); overview registry (key links); `src/components/tasks/drawer-sections.tsx` (attachments) and the comment composers in `src/components/tasks/**` and `src/components/projects/detail/comments-section.tsx` (Textarea → `MentionTextarea`, body → `MentionText`); `WatchButton` in the project header (`src/components/projects/detail/**`) and the drawer header (`src/components/tasks/**`); `useListNavigation` in `TaskList`/`TaskBoard` (`src/components/tasks/**`), the My tasks page (`src/app/(app)/tasks/**`) and `ProjectList` (`src/components/projects/project-list.tsx`); `deleteBlobs(blob_urls)` after commit in `deleteProjectAction`, `deleteTaskAction` and `deleteCommentAction` (`src/actions/{projects,tasks,comments}.ts`); `isBlobEnabled()` for `TaskDrawerHost` in `global-overlays.tsx`.

### W4
- `templates`: `src/lib/data/templates.ts`; `src/actions/templates.ts`; `src/lib/schemas/templates.ts`; `src/components/templates/**`.
- `scorecard`: `src/lib/data/scorecard.ts`, `src/lib/data/golive.ts`; `src/actions/scorecard.ts`, `src/actions/golive.ts`; `src/lib/schemas/{scorecard,golive}.ts`; `src/components/scorecard/**`, `src/components/golive/**`.
- `updates-risks`: `src/lib/data/status-updates.ts`, `src/lib/data/risks.ts`; `src/actions/status-updates.ts`, `src/actions/risks.ts`; `src/lib/schemas/{status-updates,risks}.ts`; `src/components/updates/**`, `src/components/risks/**`.
- `evals-batches`: `src/lib/data/evals.ts`, `src/lib/data/batches.ts`; `src/actions/evals.ts`, `src/actions/batches.ts`; `src/lib/schemas/{evals,batches}.ts`; `src/components/evals/**`, `src/components/batches/**`.
- `w4-integration`: tab registry (updates, risks, evals, batches); overview registry (scorecard, latest update, go-live, top risks); `src/components/milestones/gate-action-slot.tsx` (return `GateDialog`); `src/components/settings/registry.ts` (templates); template-enabled new-project flow (`NewProjectDialogHost` in `src/components/projects/new-project-dialog-host.tsx` and the "New project" buttons on `/projects` and `/dashboard` use `NewProjectWithTemplate`); project actions menu (`src/components/projects/detail/project-actions.tsx`: Save as template, Convert to pilot, Propose retainer); palette entries Post update, Add risk, Log eval run appended to `src/components/command/registry.ts` (never `command-palette.tsx`).

### W5
- `time`: `src/lib/data/time.ts`; `src/actions/time.ts`; `src/lib/schemas/time.ts`; `src/components/time/**`; `src/app/(app)/time/**`; `src/app/api/export/time/route.ts`; `src/app/(app)/team/**`; `src/components/team/**`.
- `reports`: `src/lib/data/reports.ts`; `src/app/(app)/reports/**`; `src/components/reports/**`; `src/app/api/export/projects/route.ts`, `src/app/api/export/tasks/route.ts`.
- `productivity`: `src/lib/data/views.ts`; `src/actions/views.ts`, `src/actions/bulk.ts`; `src/lib/schemas/{views,bulk}.ts`; `src/components/views/**`, `src/components/bulk/**`.
- `home`: `src/lib/data/home.ts`; `src/app/(app)/dashboard/**`; `src/components/dashboard/**`.
- `w5-integration`: `src/lib/constants.ts` (enable `time`, `reports`); `topbar-actions.tsx` (TimerPill); `sidebar-extra.tsx` (FavoritesSection, ViewsSection); `global-overlays.tsx` (LogTimeDialogHost, `savedViews` prop of `CommandPalette`); tab registry (time); overview registry (budget); drawer sections (time); `SaveViewButton` in the projects/tasks/calendar/timeline toolbars; `BulkActionBar` + selection in My tasks, the project Tasks list view and the projects list; `FavoriteToggle` on the project header and project card; palette entries Start/stop timer (`toggle-timer`) and Log time appended to `src/components/command/registry.ts`; margin in `src/components/clients/commercial-summary.tsx` (`getProjectMargin`).

### W6
- `polish`: removes every demo/dummy data path (deletes `scripts/seed.ts` and the `seed`/`seed:local` scripts; PRX ships with no demo data and the first registered user becomes admin, §13), replaces sample names in UI copy with neutral placeholders, `README.md`, `.env.example`, and any file for the motion/a11y/responsive passes; runs `npm run build`.

## 23. Cross-cutting rules

### 23.1 Activity

Every mutation of project-scoped data logs exactly one activity row through `logActivity` (v1 member diffs still log one row per member). Use the most specific `ActivityType` (`ACTIVITY_LABELS` is the fallback text); messages are short past-tense sentences without the actor's name ("moved PRX-12 to In review", "decided Go on Pilot"). Task-related entries set `task_id`. Writes inside a transaction pass the transaction to `logActivity` (W2 tasks adds the `q` parameter). Messages and `meta` never contain commercial amounts. Exempt (no activity): personal state — time entries, timers, notifications read state, watch/unwatch, favourites, saved views — workspace configuration — label catalogue edits, app settings, custom template CRUD (including Save as template) — and pure reordering (metrics, favourites, saved views, project positions, task position inside a board column). `reorderMilestones` is not exempt (phase order drives the stepper and `activateNextPhase`): it logs `milestones_reordered`; checklist edits log `task_updated` at most once per action (§18.1). Client CRUD logs with `project_id = null` and `meta.client_id`. Each §18 action names its type; when in doubt use the most specific type in `ACTIVITY_TYPES` and never reuse a neighbouring one (a deletion is never logged as `*_updated` or `*_logged`).

### 23.2 Notifications (W3 onward)

- Always `notify()` / `notifyWatchers()` from `src/lib/data/notifications.ts`; never insert into `notifications` directly. Pass the transaction when there is one. The actor is never notified; inactive users are skipped.
- Watchers of a project or task are explicit (non-muted `subscriptions`) ∪ implicit (project: owner, members, creator; task: creator, assignee) minus muted rows (§17.5), so notifications reach people on legacy, template-created and bulk-edited data without backfills. Every creation path still calls `autoSubscribe` (project/task actions, templates, convert to pilot, propose retainer, bulk reassignment for the new assignee).
- Recipients: `assigned` → new assignee; `comment` → task/project watchers; `mention` → `resolveMentionRecipients(body)` (mentioned users do not also get `comment`); `task_status` → task watchers; `blocker_cleared` → assignees of `listTasksBlockedBy(id)` when a task becomes done; `gate_review` → project owner + admins; `gate_decided` → project owner, members and watchers; `status_update` → project watchers; `risk_assigned` → risk owner; `due_soon` → assignee; `update_due` → project owner; `tuning_ending` → project owner + admins; `budget_threshold` → project owner + admins.
- Dedupe keys (per recipient): `due:{taskId}:{due_date}`, `stale:{projectId}:{isoWeekKey(today)}`, `tuning:{projectId}:{TUNING_ALERT_DAYS}`, `budget:{projectId}:{threshold}:{period_start ?? "total"}`. Event notifications have no key.
- URLs: task `/tasks/PRX-12`; project `/projects/{id}`; tab `/projects/{id}?tab=updates`; comment anchors `#comment-{commentId}` on either.
- Time-based notifications are generated lazily (no cron) by `generateTimeBasedNotifications(userId, today, timeZone)` on `/inbox` and Home loads; read notifications are pruned there too. Stale / update-due checks convert timestamps to workspace dates: `isUpdateDue` (§16), i.e. `dateInTimeZone(health_updated_at ?? created_at, timeZone) <= addDaysISO(today, -cadenceDays)`.

### 23.3 Admin-only commercial data

Enforced in three layers, never only in the UI: (1) **data layer** — reads strip `contract_value`, `hourly_rate`, `price`, `invoice_status`, `usd_inr_rate` and client commercial summaries unless `includeCommercial: true`; write functions strip like reads (every function returning a `Project`, `Milestone` or `AppSettings` takes `options` and strips by default — `createMilestone`, `updateMilestone`, `requestGateReview`, `activateNextPhase`, `decideGate`, `setGoLiveDate`, `closeTuning`, `createProject`, `updateProject`); `cost_rate` is only readable via the ADMIN-ONLY time functions; margin/contract/invoice report functions are ADMIN-ONLY; (2) **actions** — the commercial rule in §18; (3) **route handlers and pages** — check `user.role` before calling ADMIN-ONLY functions or adding commercial CSV columns, and never pass commercial values as props to client components rendered for members. Members may see currencies, budgets in hours, burn %, and health.

### 23.4 Workspace time and dates

"Today" is always `getWorkspaceToday()` (workspace timezone, default Asia/Kolkata). Server pages compute it once and pass `today` to data functions and to client components as a prop; client components never derive date-only state from `new Date()` during render (hydration safety; `TimeAgo` remains the only relative-time renderer). Overdue = `isOverdueOn(due, today, closed)`; weeks start on Monday (`startOfWeekISO`, date-fns `weekStartsOn: 1`); timestamps are bucketed into days with `dateInTimeZone`. Keep v1 `formatDate` for display.

### 23.5 Visual and motion tokens (Aurora Grid; W2 design finalises the values)

- Tokens keep the v1 names and add new ones, defined on `:root` and `.dark` and mapped in `@theme inline` as `--color-*` so utilities exist: `bg`, `surface`, `surface-2`, `border`, `border-strong` (decorative only), `input-border`, `fg`, `fg-muted`, `fg-subtle` (icons/placeholders only), `accent`, `accent-hover`, `accent-fg`, `accent-soft`, `accent-soft-fg`, `ring`, `accent-2` (violet "AI"), `accent-3` (cyan), `danger`, `success`, `warning`, `glass`, `glass-border`, `grid-line`, `glow-1..3`; shadows `shadow-card`, `shadow-pop`; gradient `--grad-brand` (logo mark, active-nav bar, progress fills, primary-button sheen, focused palette border; never on body text). Light: ink `#1d1d1f` on parchment `#f5f5f7`, accent `#0066cc`; dark (showcase): `#09090b` / `#f5f5f7`, accent `#2997ff` with `accent-fg #09090b`. Exact values: product plan `visual_direction`.
- Surfaces: one fixed aurora/grid background layer in the shell (32px grid masked to the top, three drifting 600px glows, transform-only 24s loop paused when hidden). Content cards are solid `surface` + 1px `border` + `shadow-card`, radius 16px (bento tiles 20px). Glass (`glass` + `backdrop-filter: blur(12px) saturate(1.4)` + `glass-border`) only on floating chrome: topbar, palette, popovers, dropdowns, dialogs, drawer header, bulk bar, mobile nav; solid `surface` under `data-transparency="reduce"`. Sidebar is slightly dimmer than content with a 2px gradient bar on the active item.
- Shape and type: controls 10px radius, cards 16px, dialogs 20px; buttons and chips are pills; focus = 2px `ring` with 2px offset on `:focus-visible`. Inter (variable, `--font-sans`) replaces Geist Sans; Geist Mono (`--font-mono`) for task keys, `Kbd` and timesheet numbers. Body 14/20, small 12/16, page title 24/30 semibold −0.02em (20/28 on phones), section 16/24, KPI 30/36. `tabular-nums` on every compared number. Copy: short, declarative, sentence case, ends with a period ("No tasks yet. Add the first one.").
- Motion: CSS tokens `--dur-1` 100ms (press/toggle), `--dur-2` 150ms (hover/tooltip/palette), `--dur-3` 200ms (popover/dropdown/list item/bulk bar), `--dur-4` 280ms (dialog/drawer/page enter); exits ≈ 0.7×; eases `--ease-out-expo` (enter), `--ease-out-quart` (hover/progress), `--ease-in-exit`, `--ease-drawer`. JS mirrors in `MOTION` (constants). Springs `{ type: "spring", visualDuration: 0.3, bounce: 0.15 }`, bounce 0 for data. Stagger 35ms, max 8 items, first mount only. Animate only transform/opacity (and SVG `stroke-dashoffset`); never `transition: all`; every animation interruptible; no UI feedback longer than 300ms; loaders appear after 150ms and stay ≥ 300ms. `LazyMotion strict` + `domAnimation` globally (`m` from `motion/react-m`), `domMax` only where layout animation is needed; every file importing motion starts with `"use client"`. Page enter (`src/app/(app)/template.tsx`): opacity 0→1, y 6→0, 220ms ease-out-expo, enter only.
- Reduced motion: `MotionConfig reducedMotion` follows `data-motion` (System / Reduced / Full, `localStorage[STORAGE_KEYS.motion]`), transparency follows `data-transparency` (System / Reduced, `STORAGE_KEYS.transparency`); both are applied by the theme script before first paint. Reduced: page enter opacity-only 120ms, static aurora and skeletons, no particles, tickers jump, static conic borders, no stagger, no drag tilt.

### 23.6 Accessibility

Every drag has a keyboard or menu alternative: the task board uses dnd-kit's `KeyboardSensor` with `sortableKeyboardCoordinates` (also for reordering inside a column) plus the card status menu; milestones, favourites, saved views (`ViewsSection`), checklist items (`TaskChecklist`) and scorecard metrics (`ScorecardCard`) have "Move up" / "Move down" menu items calling the same reorder action; the calendar's keyboard alternative is the due-date field in the drawer. Every dnd-kit context sets `accessibility.announcements` that name the item (task key and title, phase name, metric name). Colour never carries meaning alone: statuses, RAG, risk severity, budget thresholds and quality chips always show a label or icon with text. Dialogs and sheets have titles (sr-only where visually redundant; cmdk palette included). Lists with keyboard navigation use roving focus (j/k) and announce selection; the bulk bar is reachable and Esc clears it; toasts stay polite. Visible focus rings everywhere; hit areas ≥ 40px on coarse pointers; layouts work at 320px with 16px gutters and no horizontal page scroll (timeline, calendar and timesheet scroll inside their own containers).

### 23.7 Security and performance

Route handlers check the session themselves. Link attachments accept http(s) only (`isHttpUrl`); file attachments are validated by host and pathname prefix. CSV output goes through `toCsv` (formula-injection safe). Search escapes LIKE wildcards (`likeContains`/`likePrefix`). Never trust ids from the client for authorisation: re-load the row and check role/ownership. Recharts only through `next/dynamic` on `/reports`; dashboard visuals are hand-rolled SVG. Avoid N+1 queries: hydrate with grouped queries (`ANY($1::text[])`); load independent data with `Promise.all` in pages.

### 23.8 Verification for every agent

Before finishing: `npx tsc --noEmit -p tsconfig.json` and `npm run lint` pass; data-layer agents exercise their new functions against the local PGlite database with a throwaway script run through `node scripts/dev-local.mjs npx tsx <script>` (outside the repo); nobody runs `next dev`/`next build` (W6 builds). Integration agents also run the bootstrap twice.

## 24. Definition of done (v2)

All of §14, plus: every feature in §15's scope works end to end for an admin and for a member (members never see commercial data); legacy projects keep their manual progress and every v1 flow keeps working; NAV shows only shipped pages; the schema bootstrap is idempotent on a fresh database and on the v1 demo database; light, dark, reduced-motion and reduced-transparency modes all render correctly at 320px, 768px and 1440px.
