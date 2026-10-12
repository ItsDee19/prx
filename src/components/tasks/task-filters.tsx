"use client";

import { useTransition, type ButtonHTMLAttributes, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Tag, X } from "lucide-react";
import { LabelPicker } from "@/components/labels/label-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LabelSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

type ParamValue = string | string[] | null;

/** Updates URL search params in place (router.replace, no scroll jump); `null` removes a key. */
export function useUpdateParams(): { update: (patch: Record<string, ParamValue>) => void; pending: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(patch: Record<string, ParamValue>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      params.delete(key);
      if (value === null || value === "") continue;
      for (const item of Array.isArray(value) ? value : [value]) if (item) params.append(key, item);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return { update, pending };
}

/** Pill trigger shared by the toolbar filters. */
export function FilterPill({
  active,
  children,
  className,
  ...props
}: { active: boolean; children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "relative inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium outline-none",
        "transition-[background-color,border-color,color] duration-(--dur-2)",
        "focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-border-strong",
        "pointer-coarse:after:absolute pointer-coarse:after:-inset-y-1 pointer-coarse:after:inset-x-0",
        active
          ? "border-accent/40 bg-accent-soft text-accent-soft-fg"
          : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface FilterOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface FilterMenuProps {
  /** Shown before the selected option, e.g. "Assignee". */
  label: string;
  value: string;
  /** The "any" option; its value is "". */
  allLabel: string;
  options: FilterOption[];
  /** Options listed above a separator (e.g. "Me", "Unassigned"). */
  specialOptions?: FilterOption[];
  onChange: (value: string) => void;
  icon?: ReactNode;
}

/** Single-select filter as a pill + dropdown menu (radio items). */
export function FilterMenu({ label, value, allLabel, options, specialOptions = [], onChange, icon }: FilterMenuProps) {
  const all = [...specialOptions, ...options];
  const selected = all.find((option) => option.value === value);
  const active = Boolean(value && selected);

  const item = (option: FilterOption) => {
    const isSelected = option.value === value;
    return (
      <DropdownMenuItem
        key={option.value || "__all"}
        role="menuitemradio"
        aria-checked={isSelected}
        onSelect={() => onChange(option.value)}
      >
        {option.icon}
        <span className="min-w-0 flex-1 truncate">{option.label}</span>
        {isSelected ? <Check className="text-accent!" aria-hidden /> : null}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <FilterPill active={active} aria-label={`${label}: ${active ? selected?.label : allLabel}`}>
          {icon}
          <span className="hidden sm:inline">{label}:</span>
          <span className="max-w-32 truncate">{active ? selected?.label : allLabel}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-70" />
        </FilterPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[12rem] max-w-72">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {item({ value: "", label: allLabel })}
        {specialOptions.map(item)}
        {options.length > 0 ? <DropdownMenuSeparator /> : null}
        {options.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface LabelFilterProps {
  labels: LabelSummary[];
  value: string[];
  onChange: (ids: string[]) => void;
}

/** Multi-select label filter (any-of) built on the shared LabelPicker. */
export function LabelFilter({ labels, value, onChange }: LabelFilterProps) {
  const names = labels.filter((label) => value.includes(label.id)).map((label) => label.name);
  const summary = names.length === 0 ? "Any" : names.length === 1 ? names[0] : `${names.length} labels`;
  return (
    <span className="inline-flex items-center gap-1">
      <LabelPicker
        labels={labels}
        value={value}
        onChange={onChange}
        allowCreate={false}
        aria-label="Filter by label"
        trigger={
          <FilterPill active={value.length > 0} aria-label={`Labels: ${summary}`}>
            <Tag aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">Labels:</span>
            <span className="max-w-32 truncate">{summary}</span>
            <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-70" />
          </FilterPill>
        }
      />
      {value.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange([])}
          aria-label="Clear the label filter"
          className="relative inline-flex size-6 items-center justify-center rounded-full text-fg-subtle outline-none transition-colors duration-(--dur-2) hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </span>
  );
}
