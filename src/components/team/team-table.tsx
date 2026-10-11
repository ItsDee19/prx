"use client";

import type { ReactNode } from "react";
import { Users } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { User } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { MemberActions } from "./member-actions";

export interface TeamTableProps {
  users: User[];
  /** Open-project count per user id (missing = 0). */
  projectCounts: Record<string, number>;
  currentUserId: string;
  /** Admins get the row menu; everyone else sees a read-only directory. */
  canManage: boolean;
}

/**
 * Team directory. A real <table> from `md` up; stacked cards below so every
 * field stays readable at 375px without horizontal scrolling.
 */
export function TeamTable({ users, projectCounts, currentUserId, canManage }: TeamTableProps) {
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
              <Th className="w-[34%]">Member</Th>
              <Th className="w-[18%]">Job title</Th>
              <Th className="w-[11%]">Role</Th>
              <Th className="w-[10%] text-right">Projects</Th>
              <Th className="w-[13%]">Status</Th>
              <Th className="w-[14%]">Joined</Th>
              {canManage ? (
                <Th className="w-12">
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
                          <span className="truncate font-medium text-fg">{user.name}</span>
                          {isSelf ? <YouBadge /> : null}
                        </div>
                        <a
                          href={`mailto:${user.email}`}
                          className="block truncate text-xs text-fg-muted outline-none transition-colors duration-150 hover:text-accent focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {user.email}
                        </a>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span className={cn("block truncate", !user.job_title && "text-fg-subtle")}>
                      {user.job_title ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <RoleBadge user={user} />
                  </Td>
                  <Td className="text-right tabular-nums">{projectCounts[user.id] ?? 0}</Td>
                  <Td>
                    <StatusBadge active={user.is_active} />
                  </Td>
                  <Td className="whitespace-nowrap text-fg-muted">
                    <time dateTime={user.created_at}>{formatDate(user.created_at)}</time>
                  </Td>
                  {canManage ? (
                    <Td className="text-right">
                      <MemberActions user={user} currentUserId={currentUserId} />
                    </Td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone */}
      <ul className="space-y-3 md:hidden" aria-label="Team members">
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          return (
            <li
              key={user.id}
              className={cn(
                "rounded-lg border border-border bg-surface p-4",
                !user.is_active && "text-fg-muted",
              )}
            >
              <div className="flex items-start gap-3">
                <UserAvatar user={user} size="lg" className={cn(!user.is_active && "opacity-70")} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-medium text-fg">{user.name}</span>
                    {isSelf ? <YouBadge /> : null}
                  </div>
                  <a
                    href={`mailto:${user.email}`}
                    className="block truncate text-xs text-fg-muted outline-none transition-colors duration-150 hover:text-accent focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {user.email}
                  </a>
                  {user.job_title ? <p className="mt-0.5 truncate text-xs text-fg-muted">{user.job_title}</p> : null}
                </div>
                {canManage ? (
                  <div className="-mr-2 -mt-1 shrink-0">
                    <MemberActions user={user} currentUserId={currentUserId} />
                  </div>
                ) : null}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-fg-muted">Role</dt>
                  <dd>
                    <RoleBadge user={user} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-fg-muted">Status</dt>
                  <dd>
                    <StatusBadge active={user.is_active} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-fg-muted">Active projects</dt>
                  <dd className="font-medium tabular-nums text-fg">{projectCounts[user.id] ?? 0}</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-fg-muted">Joined</dt>
                  <dd className="text-fg">
                    <time dateTime={user.created_at}>{formatDate(user.created_at)}</time>
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
