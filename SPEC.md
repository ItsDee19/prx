# PRX — Build Specification

PRX is AvlysAI's internal project management app. Team members sign in, see a dashboard, and create/edit projects. Every project can contain sub-projects, nested to any depth. This document is the single source of truth for everyone building it. Read it fully before writing code; the contract files it references already exist and must not be changed without updating this spec:

- `src/lib/types.ts` — all domain types, filters, action result shapes
- `src/lib/constants.ts` — status/priority config, labels, colours, cookie name, nav items
- `src/lib/utils.ts` — `cn`, date helpers, `initials`, `isOverdue`, `relativeTime`, etc.
- `src/lib/db.ts` — `getDb()` (better-sqlite3 singleton), `newId()`, `nowISO()` and the full SQL schema

## 1. Product scope

- Statuses: To Start, Ongoing, On Hold, Completed, Cancelled (`ProjectStatus`). Priorities: Low, Medium, High, Urgent.
- Project fields: name, description, status, priority, owner, members, start date, due date, progress (0–100, manual), optional colour, parent (for sub-projects).
- Sub-projects are ordinary projects with `parent_id` set. Unlimited depth. A project page shows its sub-project tree, breadcrumbs to ancestors, members, comments and an activity log.
- Users: `admin` or `member`. Any active user can create/edit projects, manage members and comment. Only admins, the project creator, or the project owner may delete a project (cascades to sub-projects). Only admins manage users (create, change role, deactivate, reset password). Users are never deleted, only deactivated.
- Self-registration at `/register` is restricted to email domains in `ALLOWED_EMAIL_DOMAINS` (env, comma separated; default `avlysai.com`; empty = any). The very first user to register becomes admin.

## 2. Stack and conventions

- Next.js 15.5 App Router, React 19, TypeScript strict, Tailwind CSS v4 (`@import "tailwindcss"` in `src/app/globals.css`), `radix-ui` (unified package: `import { Dialog, DropdownMenu, Popover, Tooltip } from "radix-ui"`), `lucide-react` icons, `sonner` toasts, `zod` v4, `bcryptjs`, `better-sqlite3`, `@dnd-kit/*`.
- Path alias `@/*` → `src/*`. Server components by default; add `"use client"` only where hooks/events are needed. Server-only modules (`src/lib/auth.ts`, `src/lib/data/*`, `src/actions/*`) must never be imported from client components; client components receive data via props and call server actions.
- The data layer (`src/lib/data/*`) and `src/lib/password.ts` must NOT import anything from `next/*` so the seed script can import them from Node.
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
scripts/seed.ts                    demo data (`npm run seed`)
```

## 4. Data model

See the SQL in `src/lib/db.ts`. `users.is_active` is stored as 0/1 and must be mapped to boolean in the data layer. `activity.meta` is a JSON string, mapped to an object. `sessions.id` stores the SHA-256 hex of the cookie token (never the raw token).

## 5. Data layer API (`src/lib/data/*.ts`) — exact exports

All functions are synchronous (better-sqlite3) unless noted, use prepared statements with bound parameters (never string interpolation of values), and return the types from `src/lib/types.ts`.

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
- `deleteProject(id: string): void` — relies on ON DELETE CASCADE.
- `setProjectMembers(id: string, userIds: string[]): UserSummary[]` and `getProjectMembers(id: string): UserSummary[]`
- `reorderProjects(parentId: string | null, orderedIds: string[]): void` — rewrites `position` 0..n in a transaction.
- `getProjectStats(scope?: "top_level" | "all"): ProjectStats` — default `top_level`. `overdue` = open projects with due_date < today. `due_this_week` = open with due_date within today..today+7. `completed_last_30_days` by `completed_at`.
- `listUpcomingDeadlines(limit?: number): ProjectWithMeta[]` — open projects with a due date, soonest first (overdue included, first).
- `listMyProjects(userId: string, limit?: number): ProjectWithMeta[]` — open projects where user is owner, creator or member, by updated desc.
- Hydration helper (internal): fetch rows, then owner/parent_name via joins, members via one grouped query, sub-project counts and comment counts via correlated subqueries. Avoid N+1 per row beyond that.

`src/lib/data/comments.ts`
- `listComments(projectId: string): Comment[]` (oldest first, with `author`), `getComment(id): Comment | null`, `createComment(projectId, userId, body): Comment`, `deleteComment(id): void`

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

All primitives accept `className` and forward refs where they wrap native elements. Styling uses the tokens in §10 (`bg-surface`, `border-border`, `text-fg`, `text-fg-muted`, `bg-accent`, `text-accent-fg`, …); dark mode is handled by the tokens, not by per-usage `dark:` classes (except status/priority tones).

- `button.tsx`: `type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger"`, `type ButtonSize = "sm" | "md" | "lg" | "icon"`, `buttonVariants({ variant?, size?, className? }): string`, `Button` (forwardRef; props `variant`, `size`, `loading?: boolean` → shows `<Spinner>` and disables, plus native button props; `type` defaults to `"button"`).
- `input.tsx`: `Input`, `Textarea` (both forwardRef, prop `invalid?: boolean` adds the danger ring).
- `label.tsx`: `Label`. `form-field.tsx`: `FormField({ label, htmlFor, error?, hint?, required?, children, className? })` — renders label, control, hint and error (`role="alert"`, danger colour).
- `native-select.tsx`: `NativeSelect` (forwardRef `<select>`, `invalid?`, chevron icon overlay). `checkbox.tsx`: `Checkbox` (styled native checkbox, forwardRef).
- `dialog.tsx` (radix `Dialog`): re-export `Dialog`, `DialogTrigger`, `DialogClose`; `DialogContent({ title, description?, children, className?, size?: "sm" | "md" | "lg" })` renders Portal, Overlay (blur + fade), Content (scale/fade in, centred, `max-h-[90vh] overflow-y-auto`), header with `Dialog.Title`/`Dialog.Description` and a close X button (aria-label "Close"); `DialogFooter`.
- `dropdown-menu.tsx` (radix `DropdownMenu`): re-export `DropdownMenu`, `DropdownMenuTrigger`; `DropdownMenuContent({ children, align?, sideOffset?, className? })` (Portal + styled); `DropdownMenuItem({ children, onSelect?, destructive?, disabled?, className?, asChild? })`; `DropdownMenuSeparator`; `DropdownMenuLabel`; `DropdownMenuCheckboxItem({ checked, onCheckedChange, children })`.
- `popover.tsx`: `Popover`, `PopoverTrigger`, `PopoverContent({ children, align?, className? })`.
- `tooltip.tsx`: `TooltipProvider` (mount once in root layout), `Tooltip({ content, children, side? })` (`children` is a single element; uses `asChild`).
- `badge.tsx`: `Badge({ tone?: BadgeTone, dot?: boolean, children, className? })` with light/dark classes per tone, e.g. blue → `bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/30`.
- `avatar.tsx`: `UserAvatar({ user: { name: string; color: string }, size?: "xs" | "sm" | "md" | "lg", className? })` (initials on `user.color`), `AvatarStack({ users: { id: string; name: string; color: string }[], max?: number, size? })` (overlapping, "+N" overflow, tooltip with names).
- `card.tsx`: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- `empty-state.tsx`: `EmptyState({ icon?: LucideIcon, title, description?, action?: ReactNode, className? })`.
- `progress.tsx`: `ProgressBar({ value, size?: "sm" | "md", showLabel?, className? })` — accent bar, green at 100, `role="progressbar"` with aria attributes.
- `confirm-dialog.tsx` (`"use client"`): `ConfirmDialog({ trigger, title, description?, confirmLabel?, cancelLabel?, destructive?, onConfirm: () => Promise<unknown> | unknown })` — manages open and pending state; closes after `onConfirm` resolves.
- `page-header.tsx`: `PageHeader({ title, description?, actions?, breadcrumbs?: { label: string; href?: string }[], className? })`.
- `time-ago.tsx` (`"use client"`): `TimeAgo({ date, className? })` — renders `formatDate(date)` initially and switches to `relativeTime(date)` after mount; `title` = `formatDateTime(date)`; refreshes every 60s.
- `spinner.tsx`: `Spinner({ className?, size?: "sm" | "md" })`. `skeleton.tsx`: `Skeleton({ className })`.
- `segmented-control.tsx` (`"use client"`): `SegmentedControl<T extends string>({ value, onChange, options: { value: T; label: string; icon?: LucideIcon }[], ariaLabel, className? })` — `role="radiogroup"`.
- `toaster.tsx` (`"use client"`): `Toaster` wrapping sonner's Toaster (top-right, `richColors`, theme following `.dark`). Elsewhere use `import { toast } from "sonner"`.
- `src/components/projects/status-badge.tsx`: `StatusBadge({ status, className? })` (Badge with dot, label from STATUS_CONFIG). `priority-badge.tsx`: `PriorityBadge({ priority, iconOnly?, className? })` (lucide: low `ArrowDown`, medium `Minus`, high `ArrowUp`, urgent `AlertTriangle`; colour from `PRIORITY_CONFIG.iconClass`). `due-date.tsx`: `DueDate({ date, status, className?, withIcon? })` — "—" when null, red + "Overdue" tooltip when `isOverdue`, amber when due within 3 days, muted otherwise.

## 10. App shell and theming

`src/app/globals.css` defines tokens on `:root` and `.dark`, mapped via `@theme inline` so Tailwind utilities exist: `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-border-strong`, `--color-fg`, `--color-fg-muted`, `--color-fg-subtle`, `--color-accent`, `--color-accent-hover`, `--color-accent-fg`, `--color-accent-soft`, `--color-danger`, `--color-success`, `--color-warning`, `--font-sans` (Geist), `--font-mono`. Light: bg `#f6f6f8`, surface `#ffffff`, surface-2 `#f1f1f4`, border `#e6e6eb`, border-strong `#d2d2da`, fg `#1a1a21`, fg-muted `#6b6b78`, fg-subtle `#9a9aa6`, accent `#5b5bd6`, accent-hover `#4a4ac4`, accent-fg `#ffffff`, accent-soft `#ececfb`, danger `#e5484d`, success `#30a46c`, warning `#e8a317`. Dark: bg `#0e0e11`, surface `#16161a`, surface-2 `#1d1d22`, border `#27272e`, border-strong `#363640`, fg `#ededf0`, fg-muted `#9b9ba7`, fg-subtle `#6c6c78`, accent `#8484f5`, accent-hover `#9c9cf7`, accent-fg `#0e0e11`, accent-soft `#24244d`, danger `#ff6369`, success `#3dd68c`, warning `#ffb224`. Add `@custom-variant dark (&:where(.dark, .dark *));`, base styles (`body { @apply bg-bg text-fg antialiased; }`), a thin custom scrollbar, and `::selection` in accent-soft.

Theme: class strategy. `src/components/layout/theme-script.tsx` exports an inline `<script>` that reads `localStorage["prx-theme"]` (`"light" | "dark" | "system"`, default system) and toggles `.dark` on `<html>` before paint. `theme-toggle.tsx` (`"use client"`) sets the theme and persists it. Root `<html>` uses `suppressHydrationWarning`.

Shell: left sidebar (w-64, `bg-surface`, border-right) with the PRX wordmark + "AvlysAI" caption, nav from `NAV_ITEMS` (active state by `usePathname`, lucide icons), and a footer user menu (`UserAvatar`, name, role; dropdown with Settings, theme toggle, Log out via `<form action={logoutAction}>`). On `< lg` the sidebar collapses into a drawer opened from a top bar hamburger. Main area: `bg-bg`, content container `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6`. Pages start with `<PageHeader>`. Motion: 150ms transitions on hover/focus, dialogs fade/scale 150ms, respect `prefers-reduced-motion`.

## 11. Pages

`/login` and `/register` (`(auth)` group): two-column layout on `lg` (brand panel left: PRX wordmark, "AvlysAI", one-line tagline, three short value bullets; form right), single column centred below. Forms use `useActionState` with `loginAction`/`registerAction` and `INITIAL_FORM_STATE`; show field errors under inputs and a top-level error banner; submit button shows pending state; links between login/register. Login reads `?next=` from the URL into a hidden input. Register shows "Only @avlysai.com addresses can register" (domain list from a prop computed server-side) and "The first account created becomes the admin" when `countUsers() === 0`.

`/dashboard`: `PageHeader` "Good morning/afternoon/evening, {first name}" with the date; four stat cards (Total projects, Ongoing, Due this week, Overdue — each with icon and a one-line caption); a "Status overview" card with a horizontal stacked bar + legend per status (counts from `getProjectStats()`); two columns below: "My projects" (`listMyProjects`, `ProjectCard` compact, link to /projects) and "Upcoming deadlines" (`listUpcomingDeadlines(8)`, rows with name, `DueDate`, owner avatar); then "Recent activity" (`listRecentActivity(12)`: avatar, actor name, message, project link, `TimeAgo`). Empty states everywhere with a primary "New project" action.

`/projects`: `PageHeader` "Projects" with description and a primary "New project" button (`ProjectDialog mode="create"`). Toolbar: search input (debounced, updates `?q=`), status filter (multi, dropdown checkbox items), priority filter, owner filter, "Include sub-projects" toggle, sort select, and a `SegmentedControl` for view `board | list` (persisted in `?view=`). All filters live in the URL search params (page is a server component reading `searchParams` — in Next 15 it is a Promise, await it) so links are shareable; a client `ProjectsToolbar` component updates them with `router.replace`. Board view: one column per status in `STATUS_ORDER` with count badge, cards via `ProjectCard`, drag-and-drop between columns with `@dnd-kit` (optimistic update, `updateProjectStatusAction`, toast on failure and revert), "+ Add" at the bottom of each column opening `ProjectDialog` with `defaultStatus`. List view: table (name + colour dot + sub-project count pill, status via `StatusSelect`, priority badge, owner avatar+name, members `AvatarStack`, start/due dates, progress bar, updated `TimeAgo`); rows link to the project; sortable by clicking headers (sort param). Results count. Empty state when nothing matches with a "Clear filters" button.

`/projects/[id]`: `notFound()` when missing. Breadcrumbs: Projects › ancestors › current. Header: colour dot + name (h1), `StatusSelect`, `PriorityBadge`, actions: "Add sub-project" (`ProjectDialog mode="create" parentId`), "Edit" (`ProjectDialog mode="edit"`), overflow menu with "Delete" (`ConfirmDialog`, only when `canDeleteProject`; after delete navigate to the parent project or `/projects`). Two-column layout (`lg:grid-cols-[1fr_320px]`). Main column: description (pre-wrapped, empty placeholder), "Sub-projects" card with count and completed/total mini progress, a tree (`ProjectTree` client component: expandable rows with indentation guides, status dot/badge, name link, owner avatar, `DueDate`, small progress bar, per-row "+" to add a nested sub-project and a row menu with Edit/Delete), empty state "No sub-projects yet"; "Comments" card (list with avatar, name, `TimeAgo`, body with whitespace preserved, delete for author/admin; composer textarea + "Comment" button, Cmd/Ctrl+Enter submits). Side column: "Details" card (Owner, Members `AvatarStack` + "Manage" popover with checkbox list of users → `setProjectMembersAction`, Start, Due with `DueDate`, Progress with an editable slider/number → `updateProjectProgressAction` on commit, Created by, Created/Updated `TimeAgo`), "Activity" card (timeline of `listProjectActivity(id, 30)`).

`/team`: `PageHeader` "Team" + (admin) "Add member" button → dialog (name, email, job title, role, temporary password; `createUserAction`). Table/cards: avatar, name, email, job title, role badge, active projects count (`getUserProjectCounts`), status (Active/Deactivated), joined date; admin row menu: change role, reset password (dialog), deactivate/reactivate (`ConfirmDialog`). Non-admins see a read-only directory. "You" marker on the current user.

`/settings`: two cards. "Profile": name, job title, avatar colour picker (swatches from `AVATAR_COLORS`, live preview with `UserAvatar`), save → `updateProfileAction`. "Password": current, new, confirm → `changePasswordAction`. Plus an "Appearance" card with the theme selector (Light / Dark / System via `SegmentedControl`). Inline validation + toasts.

## 12. Shared project components (contracts)

- `src/components/projects/project-dialog.tsx` (`"use client"`): `ProjectDialog({ mode: "create" | "edit"; project?: ProjectWithMeta; parentId?: string | null; parentName?: string | null; users: UserSummary[]; trigger: ReactNode; defaultStatus?: ProjectStatus; onSuccess?: (id: string) => void })`. Fields: name, description, status, priority, owner (NativeSelect of users + "Unassigned"), members (checkbox list in a scrollable box, with avatars), start date, due date (native date inputs), progress (range + number), colour swatches. Client-side checks mirror `projectInputSchema`; server fieldErrors displayed. Calls `createProjectAction` / `updateProjectAction`, toasts, `router.refresh()`, closes, calls `onSuccess`. The dialog title says "New sub-project in {parentName}" when `parentId` is set.
- `src/components/projects/project-card.tsx`: `ProjectCard({ project: ProjectWithMeta; compact?: boolean; className? })` — `Link` to `/projects/{id}`; colour bar/dot, name, parent name (small, when present), description (2 lines clamp, not in compact), `StatusBadge`, `PriorityBadge iconOnly`, `DueDate`, `AvatarStack` of owner+members, sub-project pill ("3/5 sub-projects"), comment count, `ProgressBar sm`.
- `src/components/projects/status-select.tsx` (`"use client"`): `StatusSelect({ projectId, status, size?: "sm" | "md", className? })` — dropdown trigger looks like a `StatusBadge` with a chevron; items list all statuses with dots; calls `updateProjectStatusAction`, optimistic, toast on error, `router.refresh()`.

## 13. Seed (`scripts/seed.ts`, run with `npm run seed`)

Imports only `@/lib/db`, `@/lib/data/*`, `@/lib/password`, `@/lib/utils` (never `next/*`). If users already exist, print a message and exit unless `--force` is passed (then delete all rows from all tables). Create 5 users (one admin), ~10 top-level projects across all statuses and priorities with realistic AI-company names and descriptions, 10–14 sub-projects (some nested two levels), members, 8–10 comments, and activity entries via `logActivity`. Dates relative to today so some are overdue and some due this week. Print the login credentials at the end. The same credentials must be documented in `README.md`.

## 14. Definition of done

`npm run typecheck`, `npm run lint` and `npm run build` pass with zero errors. Every page works in light and dark mode, at 375px and 1440px widths, with keyboard only. No console errors or hydration warnings in dev. Every mutation gives feedback (toast or inline) and refreshes data. Empty, loading (pending buttons) and error states exist. No placeholder text, TODOs, or stubbed functions remain.
