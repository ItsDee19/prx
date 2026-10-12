"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { CLIENT_REGION_CONFIG } from "@/lib/constants";
import type { ClientRegion } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ClientsToolbarProps {
  q: string;
  industry: string | null;
  region: ClientRegion | null;
  archived: boolean;
  /** Distinct industries for the filter. */
  industries: string[];
  className?: string;
}

type RegionFilter = ClientRegion | "all";

const REGION_OPTIONS: { value: RegionFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "india", label: CLIENT_REGION_CONFIG.india.label },
  { value: "international", label: CLIENT_REGION_CONFIG.international.label },
];

const SEARCH_DEBOUNCE_MS = 300;

/** Search, industry, region and "show archived" for /clients, all in the URL. */
export function ClientsToolbar({ q, industry, region, archived, industries, className }: ClientsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(q);
  const searchRef = useRef<HTMLInputElement>(null);
  const switchId = useId();

  const setParams = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === q) return;
    const timer = window.setTimeout(() => setParams({ q: trimmed || null }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, q, setParams]);

  useEffect(() => {
    if (document.activeElement === searchRef.current) return;
    setQuery(q);
  }, [q]);

  const unknownIndustry = industry && !industries.some((item) => item.toLowerCase() === industry.toLowerCase());

  return (
    <div role="search" aria-label="Filter clients" className={cn("mb-4 flex flex-wrap items-center gap-2 sm:mb-5", className)}>
      <div className="relative w-full sm:w-64 xl:w-72">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
          placeholder="Search name, code or industry"
          aria-label="Search clients"
          autoComplete="off"
          enterKeyHint="search"
          className="pl-8 pr-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {isPending ? (
          <Spinner size="sm" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
        ) : query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-fg-subtle outline-none transition-colors duration-150 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-8"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <NativeSelect
        aria-label="Filter by industry"
        value={industry ?? ""}
        onChange={(event) => setParams({ industry: event.target.value || null })}
        wrapperClassName="min-w-36 flex-1 sm:w-auto sm:flex-none"
        className={cn("sm:w-auto sm:max-w-52", industry && "border-accent/50 bg-accent-soft/60")}
      >
        <option value="">Any industry</option>
        {industries.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
        {unknownIndustry ? <option value={industry}>{industry}</option> : null}
      </NativeSelect>

      <SegmentedControl
        ariaLabel="Region"
        value={region ?? "all"}
        onChange={(value) => setParams({ region: value === "all" ? null : value })}
        options={REGION_OPTIONS}
        className="h-9 px-1"
      />

      <div className="flex h-9 items-center gap-2 sm:ml-auto">
        <Switch id={switchId} checked={archived} onCheckedChange={(checked) => setParams({ archived: checked ? "1" : null })} />
        <label htmlFor={switchId} className="cursor-pointer select-none whitespace-nowrap text-sm text-fg">
          Show archived
        </label>
      </div>
    </div>
  );
}
