"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CalendarEntry } from "@/lib/data/calendar";
import type { ClientSummary, Label, ProjectSummary, UserSummary } from "@/lib/types";
import type { CalendarParams } from "./calendar-params";
import { CalendarToolbar, type CalendarNavigate } from "./calendar-toolbar";
import { CalendarView } from "./calendar-view";

export interface CalendarScreenProps {
  params: CalendarParams;
  today: string;
  items: CalendarEntry[];
  projects: ProjectSummary[];
  clients: ClientSummary[];
  labels: Label[];
  users: UserSummary[];
  viewerId: string;
}

/**
 * Client root of /calendar: the toolbar and the grid share one navigation
 * transition, so the grid dims while the next period or filter loads and the
 * incoming period slides in when it arrives.
 */
export function CalendarScreen({ params, today, items, projects, clients, labels, users, viewerId }: CalendarScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const navigate: CalendarNavigate = (patch, mode = "replace") => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    startTransition(() => {
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CalendarToolbar
        params={params}
        today={today}
        projects={projects}
        clients={clients}
        labels={labels}
        users={users}
        viewerId={viewerId}
        itemCount={items.length}
        pending={pending}
        navigate={navigate}
      />
      <CalendarView
        items={items}
        view={params.view}
        anchor={params.date}
        today={today}
        projectId={params.projectId || undefined}
        pending={pending}
      />
    </div>
  );
}
