"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { ProjectSummary, UserSummary } from "@/lib/types";
import { buildQueryString, cn } from "@/lib/utils";
import { ProjectSelect } from "./project-select";

/** Value of `?user=` that lists everyone's entries (admins, Entries tab only). */
export const ALL_USERS = "all";

function useUrlUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  function update(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }
  return { update, pending };
}

export interface TimeUserSwitcherProps {
  users: UserSummary[];
  /** Selected user id, or ALL_USERS. */
  value: string;
  viewerId: string;
  /** Offer "Everyone" (Entries tab). */
  allowAll: boolean;
  className?: string;
}

/** Admin-only person switcher (`?user=`). */
export function TimeUserSwitcher({ users, value, viewerId, allowAll, className }: TimeUserSwitcherProps) {
  const { update, pending } = useUrlUpdater();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Label htmlFor="time-user" className="shrink-0 text-xs text-fg-muted">
        Person
      </Label>
      <NativeSelect
        id="time-user"
        value={value}
        onChange={(event) => update({ user: event.target.value === viewerId ? null : event.target.value })}
        wrapperClassName="w-full sm:w-56"
      >
        {allowAll ? <option value={ALL_USERS}>Everyone</option> : null}
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.id === viewerId ? `${user.name} (you)` : user.name}
          </option>
        ))}
      </NativeSelect>
      {pending ? <Spinner size="sm" label="Loading" className="text-fg-subtle" /> : null}
    </div>
  );
}

export interface TimeEntriesToolbarProps {
  projects: ProjectSummary[];
  projectId: string;
  from: string;
  to: string;
  /** "", "1" (billable only) or "0" (non-billable only). */
  billable: string;
  /** CSV export query (the same filters, plus the person). */
  exportQuery: Record<string, string | null>;
}

/** Filters for the Entries tab (URL state) and the CSV export link. */
export function TimeEntriesToolbar({ projects, projectId, from, to, billable, exportQuery }: TimeEntriesToolbarProps) {
  const { update, pending } = useUrlUpdater();
  const exportHref = `/api/export/time${buildQueryString(exportQuery)}`;
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,16rem)_10rem_10rem_10rem]">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="time-filter-project">Project</Label>
          <ProjectSelect
            id="time-filter-project"
            projects={projects}
            value={projectId}
            onChange={(next) => update({ project: next || null })}
            placeholder="All projects"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="time-filter-from">From</Label>
          <Input
            id="time-filter-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => update({ from: event.target.value || null })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="time-filter-to">To</Label>
          <Input
            id="time-filter-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => update({ to: event.target.value || null })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="time-filter-billable">Billable</Label>
          <NativeSelect
            id="time-filter-billable"
            value={billable}
            onChange={(event) => update({ billable: event.target.value || null })}
          >
            <option value="">All entries</option>
            <option value="1">Billable</option>
            <option value="0">Non-billable</option>
          </NativeSelect>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {pending ? <Spinner size="sm" label="Loading" className="text-fg-subtle" /> : null}
        <a href={exportHref} download className={buttonVariants({ variant: "outline" })}>
          <Download aria-hidden />
          Export CSV
        </a>
      </div>
    </div>
  );
}
