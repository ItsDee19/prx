"use client";

import type { ReactNode } from "react";
import { Users } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Money } from "@/components/ui/money";
import type { User } from "@/lib/types";
import { cn, formatDate, pluralize } from "@/lib/utils";
import { CapacityMeter } from "./capacity-meter";
import { MemberActions } from "./member-actions";

export interface TeamTableProps {
  users: User[];
  /** Open-project count per user id (missing = 0). */
  projectCounts: Record<string, number>;
  currentUserId: string;
  /** Admins get the row menu; everyone else sees a read-only directory. */
  canManage: boolean;
  /** Minutes logged this week per user id (Monday-based, workspace timezone; missing = 0). */
  weekMinutes: Record<string, number>;
  /**
   * ADMIN-ONLY. Cost rate (INR per hour) per user id. Passed only when the
   * viewer is an admin; members never receive it.
   */
  costRates?: Record<string, number | null>;
}

/**
 * Team directory. A real <table> from `md` up; stacked cards below so every
 * field stays readable at 320px without horizontal scrolling.
 *
 * Table columns are sized so nothing overlaps or scrolls sideways:
 * - md (main column ~700-770px): Member (job title under the email), Role, This week, Status (+ actions);
 * - lg: + Job title column;
 * - xl (main column 1000px+): + Projects and Joined;
 * - 2xl+: the small columns switch to percentages so extra width on large
 *   monitors is shared between all columns instead of one huge Member column.
 * The phone cards (2-up on large phones) always show every field.
 */
export function TeamTable({ users, projectCounts, currentUserId, canManage, weekMinutes, costRates }: TeamTableProps) {
  if (users.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No team members yet"
        description="Members appear here once they register or an admin adds them."
      />
    );
  }

  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-surface md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">Team members</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-left text-xs font-medium text-fg-muted">
              <Th>Member</Th>
              <Th className="hidden w-1/5 lg:table-cell 2xl:w-[18%]">Job title</Th>
              <Th className="w-[5.5rem] 2xl:w-[9%]">Role</Th>
              <Th className="w-[9.5rem] 2xl:w-[13%]">This week</Th>
              <Th className="hidden w-[5.5rem] text-right xl:table-cell 2xl:w-[9%]">Projects</Th>
              <Th className="w-[8.5rem] 2xl:w-[12%]">Status</Th>
              <Th className="hidden w-[7.5rem] xl:table-cell 2xl:w-[12%]">Joined</Th>
              {canManage ? (
                <Th className="w-14">
                  <span className="sr-only">Actions</span>
                </Th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <tr
                  key={user.id}
                  data-inactive={!user.is_active || undefined}
                  className="transition-colors duration-150 hover:bg-surface-2/50 data-[inactive]:text-fg-muted"
                >
                  <Td>
                    <div className={cn("flex min-w-0 items-center gap-3", !user.is_active && "opacity-70")}>
                      <UserAvatar user={user} size="md" />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-fg" title={user.name}>
                            {user.name}
                          </span>
                          {isSelf ? <YouBadge /> : null}
                        </div>
                        <a
                          href={`mailto:${user.email}`}
                          title={user.email}
                          className="block truncate text-xs text-fg-muted outline-none transition-colors duration-150 hover:text-accent focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {user.email}
                        </a>
                        {user.job_title ? (
                          <span className="block truncate text-xs text-fg-muted lg:hidden" title={user.job_title}>
                            {user.job_title}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Td>
                  <Td className="hidden lg:table-cell">
                    <span
                      className={cn("block truncate", !user.job_title && "text-fg-subtle")}
                      title={user.job_title ?? undefined}
                    >
                      {user.job_title ?? "—"}
                    </span>
                    {/* The Projects column only appears at xl; until then show the count here. */}
                    <span className="block truncate text-xs tabular-nums text-fg-muted xl:hidden">
                      {pluralize(projectCounts[user.id] ?? 0, "active project")}
                    </span>
                  </Td>
                  <Td>
                    <RoleBadge user={user} />
                  </Td>
                  <Td>
                    <WeekCell user={user} minutes={weekMinutes[user.id] ?? 0} costRates={costRates} />
                  </Td>
                  <Td className="hidden text-right tabular-nums xl:table-cell">{projectCounts[user.id] ?? 0}</Td>
                  <Td>
                    <StatusBadge active={user.is_active} />
                  </Td>
                  <Td className="hidden whitespace-nowrap text-fg-muted xl:table-cell">
                    <time dateTime={user.created_at}>{formatDate(user.created_at)}</time>
                  </Td>
                  {canManage ? (
                    <Td className="pl-0 pr-3 text-right">
                      <MemberActions user={user} currentUserId={currentUserId} costRate={costRates?.[user.id] ?? null} />
                    </Td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone: one card per member, 2-up on large phones (sm). Free text wraps instead of truncating. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden" aria-label="Team members">
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          return (
            <li
              key={user.id}
              className={cn(
                "min-w-0 rounded-lg border border-border bg-surface p-4",
                !user.is_active && "text-fg-muted",
              )}
            >
              <div className="flex items-start gap-3">
                <UserAvatar user={user} size="lg" className={cn(!user.is_active && "opacity-70")} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 font-medium text-fg [overflow-wrap:anywhere]">{user.name}</span>
                    {isSelf ? <YouBadge /> : null}
                  </div>
                  <a
                    href={`mailto:${user.email}`}
                    className="mt-0.5 block text-xs text-fg-muted outline-none transition-colors duration-150 [overflow-wrap:anywhere] hover:text-accent focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {user.email}
                  </a>
                  {user.job_title ? (
                    <p className="mt-0.5 text-xs text-fg-muted [overflow-wrap:anywhere]">{user.job_title}</p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="-mr-2 -mt-1.5 shrink-0">
                    <MemberActions user={user} currentUserId={currentUserId} costRate={costRates?.[user.id] ?? null} />
                  </div>
                ) : null}
              </div>
              {/* Label above value, so a "Deactivated" badge fits even in a ~120px column at 320px. */}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 text-xs">
                <div className="min-w-0 space-y-1">
                  <dt className="text-fg-muted">Role</dt>
                  <dd>
                    <RoleBadge user={user} />
                  </dd>
                </div>
                <div className="min-w-0 space-y-1">
                  <dt className="text-fg-muted">Status</dt>
                  <dd>
                    <StatusBadge active={user.is_active} />
                  </dd>
                </div>
                <div className="min-w-0 space-y-1">
                  <dt className="text-fg-muted">Active projects</dt>
                  <dd className="font-medium tabular-nums text-fg">{projectCounts[user.id] ?? 0}</dd>
                </div>
                <div className="min-w-0 space-y-1">
                  <dt className="text-fg-muted">Joined</dt>
                  <dd className="text-fg">
                    <time dateTime={user.created_at}>{formatDate(user.created_at)}</time>
                  </dd>
                </div>
                <div className="col-span-2 min-w-0 space-y-1">
                  <dt className="text-fg-muted">This week</dt>
                  <dd>
                    <WeekCell user={user} minutes={weekMinutes[user.id] ?? 0} costRates={costRates} />
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ---------------------------------------------------------------------- */

function Th({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <th scope="col" className={cn("px-4 py-2.5 font-medium", className)}>
      {children}
    </th>
  );
}

function Td({ className, children }: { className?: string; children?: ReactNode }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

function WeekCell({
  user,
  minutes,
  costRates,
}: {
  user: User;
  minutes: number;
  costRates?: Record<string, number | null>;
}) {
  const rate = costRates ? (costRates[user.id] ?? null) : undefined;
  return (
    <div className="min-w-0 space-y-0.5">
      <CapacityMeter minutes={minutes} capacityHours={user.weekly_capacity_hours} name={user.name} />
      {rate !== undefined ? (
        <p className="truncate pl-9 text-xs text-fg-muted">
          {rate === null ? (
            "No cost rate"
          ) : (
            <>
              <Money amount={rate} currency="INR" />
              /h
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

function YouBadge() {
  return (
    <Badge tone="violet" className="shrink-0">
      You
    </Badge>
  );
}

function RoleBadge({ user }: { user: User }) {
  return user.role === "admin" ? <Badge tone="violet">Admin</Badge> : <Badge tone="neutral">Member</Badge>;
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="green" dot>
      Active
    </Badge>
  ) : (
    <Badge tone="red" dot>
      Deactivated
    </Badge>
  );
}
