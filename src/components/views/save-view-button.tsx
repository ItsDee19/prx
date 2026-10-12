"use client";

import { Suspense, useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { createSavedViewAction } from "@/actions/views";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { MOTION, SAVED_VIEW_SCOPE_CONFIG } from "@/lib/constants";
import { normalizeSavedViewFilters, SAVED_VIEW_NAME_MAX } from "@/lib/schemas/views";
import type { SavedViewFilters, SavedViewScope } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";

export interface SaveViewButtonProps {
  scope: SavedViewScope;
  /**
   * Filters to save (the page's URL params). When omitted, the button captures
   * the current URL search params at the moment it is used.
   */
  filters?: SavedViewFilters;
  /**
   * true while the page shows its default filters: the button is hidden.
   * When omitted, "default" means there is nothing to save (no filter params).
   */
  isDefault?: boolean;
  align?: "start" | "center" | "end";
  className?: string;
}

/**
 * "Save view" for list toolbars (projects, tasks, calendar, timeline). Opens
 * a popover with a name and a "Share with the team" switch; the view then
 * appears in the sidebar Views section and the command menu. Hidden while the
 * page shows its default filters.
 */
export function SaveViewButton(props: SaveViewButtonProps) {
  if (props.filters) return <SaveViewButtonInner {...props} filters={props.filters} />;
  // useSearchParams needs a Suspense boundary wherever a route could be prerendered.
  return (
    <Suspense fallback={null}>
      <SaveViewButtonFromUrl {...props} />
    </Suspense>
  );
}

function SaveViewButtonFromUrl(props: SaveViewButtonProps) {
  const search = useSearchParams();
  const filters = useMemo(() => normalizeSavedViewFilters(new URLSearchParams(search.toString())), [search]);
  return <SaveViewButtonInner {...props} filters={filters} />;
}

interface InnerProps extends SaveViewButtonProps {
  filters: SavedViewFilters;
}

function SaveViewButtonInner({ scope, filters, isDefault, align = "end", className }: InnerProps) {
  const nameId = useId();
  const shareId = useId();
  const errorId = useId();
  const reduce = useReducedMotionConfig() === true;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const clean = useMemo(() => normalizeSavedViewFilters(filters), [filters]);
  const filterCount = Object.keys(clean).length;
  const hidden = isDefault ?? filterCount === 0;
  if (hidden) return null;

  const scopeLabel = SAVED_VIEW_SCOPE_CONFIG[scope].label;

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setName("");
      setShared(false);
      setError(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setError("Give the view a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createSavedViewAction({ scope, name: value, filters: clean, is_shared: shared });
      if (!result.ok) {
        setError(result.fieldErrors?.name ?? result.error);
        return;
      }
      setOpen(false);
      toast.success(
        shared
          ? `Saved "${result.data.name}" and shared it with the team.`
          : `Saved "${result.data.name}". Find it in the sidebar and the command menu.`,
      );
    });
  }

  return (
    <m.span
      className={cn("inline-flex", className)}
      initial={reduce ? false : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduce ? { duration: 0 } : MOTION.spring}
    >
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <BookmarkPlus aria-hidden />
            Save view
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-80">
          <form onSubmit={submit} noValidate className="space-y-4" aria-label="Save view">
            <div>
              <p className="text-sm font-semibold text-fg">Save this view</p>
              <p className="mt-0.5 text-xs leading-4 text-fg-muted">
                {scopeLabel} with {pluralize(filterCount, "filter")} applied.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={nameId} className="text-xs font-medium text-fg">
                Name
              </label>
              <Input
                id={nameId}
                autoFocus
                value={name}
                maxLength={SAVED_VIEW_NAME_MAX}
                placeholder="View name"
                invalid={error !== null}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  if (error) setError(null);
                }}
              />
              {error ? (
                <p id={errorId} role="alert" className="text-xs leading-4 text-danger">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <label htmlFor={shareId} className="text-sm font-medium text-fg">
                  Share with the team
                </label>
                <p className="mt-0.5 text-xs leading-4 text-fg-muted">Everyone sees it under Views. Only you can edit it.</p>
              </div>
              <Switch id={shareId} checked={shared} onCheckedChange={setShared} className="mt-0.5" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={pending}>
                Save view
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </m.span>
  );
}
