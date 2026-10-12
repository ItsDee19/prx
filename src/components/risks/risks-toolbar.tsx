"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { RISK_CATEGORY_CONFIG, RISK_CATEGORY_ORDER, RISK_KIND_CONFIG, RISK_KIND_ORDER } from "@/lib/constants";
import type { RiskKind, UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RISK_STATUS_FILTER_LABELS, RISK_STATUS_FILTERS, type RiskStatusFilter, type RiskTabFilters } from "./risk-utils";

export interface RisksToolbarProps {
  projectId: string;
  filters: RiskTabFilters;
  /** Items per kind under the other filters (the "All" tab is their sum). */
  kindCounts: Record<RiskKind, number>;
  users: UserSummary[];
  resultCount: number;
  /** Any filter besides the default status. */
  filtered: boolean;
  /** "?tab=risks" with every filter cleared. */
  clearHref: string;
}

/**
 * Kind tabs (links with counts) and the status / category / owner filters of
 * the Risks tab. Every filter lives in the URL, so views are shareable and the
 * server tab re-renders the table.
 */
export function RisksToolbar({
  projectId,
  filters,
  kindCounts,
  users,
  resultCount,
  filtered,
  clearHref,
}: RisksToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const total = RISK_KIND_ORDER.reduce((sum, kind) => sum + kindCounts[kind], 0);

  function update(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "risks");
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function kindHref(kind: RiskKind | null): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "risks");
    if (kind) params.set("kind", kind);
    else params.delete("kind");
    return `/projects/${projectId}?${params.toString()}`;
  }

  const tabs: { kind: RiskKind | null; label: string; count: number }[] = [
    { kind: null, label: "All", count: total },
    ...RISK_KIND_ORDER.map((kind) => ({ kind, label: RISK_KIND_CONFIG[kind].plural, count: kindCounts[kind] })),
  ];

  return (
    <div className="space-y-3">
      <nav aria-label="RAID type" className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <ul className="flex min-w-max gap-1">
          {tabs.map((tab) => {
            const active = filters.kind === tab.kind;
            return (
              <li key={tab.kind ?? "all"}>
                <Link
                  href={kindHref(tab.kind)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors duration-150 pointer-coarse:h-10",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                    active ? "bg-fg text-bg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
                      active ? "bg-bg/20 text-bg" : "bg-surface-2 text-fg-muted",
                    )}
                  >
                    {tab.count}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<RiskStatusFilter>
          ariaLabel="Status"
          size="sm"
          value={filters.status}
          onChange={(value) => update("status", value === "active" ? null : value)}
          options={RISK_STATUS_FILTERS.map((value) => ({ value, label: RISK_STATUS_FILTER_LABELS[value] }))}
        />
        <NativeSelect
          aria-label="Category"
          value={filters.category ?? ""}
          onChange={(event) => update("category", event.target.value || null)}
          wrapperClassName="w-full sm:w-48"
          className="h-8"
        >
          <option value="">All categories</option>
          {RISK_CATEGORY_ORDER.map((category) => (
            <option key={category} value={category}>
              {RISK_CATEGORY_CONFIG[category].label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Owner"
          value={filters.owner ?? ""}
          onChange={(event) => update("owner", event.target.value || null)}
          wrapperClassName="w-full sm:w-44"
          className="h-8"
        >
          <option value="">Any owner</option>
          <option value="me">Owned by me</option>
          <option value="none">No owner</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs tabular-nums text-fg-muted sm:ml-auto" aria-live="polite">
          {resultCount} {resultCount === 1 ? "item" : "items"}
        </p>
        {filtered ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.replace(clearHref, { scroll: false })}
          >
            <X aria-hidden />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
