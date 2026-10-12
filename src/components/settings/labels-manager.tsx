"use client";

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createLabelAction, deleteLabelAction, updateLabelAction } from "@/actions/labels";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LABEL_COLORS, LABEL_GROUP_CONFIG, LABEL_GROUP_ORDER } from "@/lib/constants";
import { LABEL_NAME_MAX_LENGTH } from "@/lib/schemas/labels";
import type { LabelGroup, LabelWithUsage } from "@/lib/types";
import { cn, colorFromString, pluralize } from "@/lib/utils";

export interface LabelsManagerProps {
  labels: LabelWithUsage[];
  /** Admins rename, recolour, regroup and delete; everyone can add labels. */
  isAdmin: boolean;
}

function ColorSwatches({
  value,
  onChange,
  labelledBy,
}: {
  value: string;
  onChange: (color: string) => void;
  labelledBy: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-5 gap-2">
      {LABEL_COLORS.map((hex) => {
        const selected = value.toLowerCase() === hex.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Colour ${hex}`}
            onClick={() => onChange(hex)}
            style={{ backgroundColor: hex }}
            className={cn(
              "flex size-8 items-center justify-center rounded-full text-white outline-none transition-transform duration-(--dur-2) ease-spring",
              "hover:scale-110 active:scale-95 motion-reduce:hover:scale-100 pointer-coarse:size-10",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              selected && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
            )}
          >
            {selected ? <Check className="size-3.5" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** A colour dot that opens the swatch grid. */
function ColorPicker({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${value}`}
          className="relative flex size-9 shrink-0 items-center justify-center rounded-md border border-input-border bg-surface outline-none transition-colors duration-150 hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden className="size-4 rounded-full" style={{ backgroundColor: value }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <p id={id} className="mb-2 text-xs font-medium text-fg-muted">
          {label}
        </p>
        <ColorSwatches
          value={value}
          labelledBy={id}
          onChange={(color) => {
            onChange(color);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function GroupSelect({ value, onChange, label, id }: { value: LabelGroup; onChange: (group: LabelGroup) => void; label: string; id?: string }) {
  return (
    <NativeSelect
      id={id}
      aria-label={id ? undefined : label}
      value={value}
      onChange={(event) => onChange(event.target.value as LabelGroup)}
      wrapperClassName="w-full sm:w-36"
    >
      {LABEL_GROUP_ORDER.map((group) => (
        <option key={group} value={group}>
          {LABEL_GROUP_CONFIG[group].label}
        </option>
      ))}
    </NativeSelect>
  );
}

function usageText(label: LabelWithUsage): string {
  if (label.project_count === 0 && label.task_count === 0) return "Not used yet";
  const parts: string[] = [];
  if (label.project_count > 0) parts.push(pluralize(label.project_count, "project"));
  if (label.task_count > 0) parts.push(pluralize(label.task_count, "task"));
  return parts.join(" · ");
}

function LabelRow({ label, isAdmin }: { label: LabelWithUsage; isAdmin: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [group, setGroup] = useState<LabelGroup>(label.label_group);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEditing() {
    setName(label.name);
    setColor(label.color);
    setGroup(label.label_group);
    setError(null);
    setEditing(true);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the label a name.");
      return;
    }
    startTransition(async () => {
      const result = await updateLabelAction(label.id, { name: trimmed, color, label_group: group });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Label saved");
      setEditing(false);
      router.refresh();
    });
  }

  async function remove() {
    const result = await deleteLabelAction(label.id);
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    toast.success(`Deleted "${label.name}"`);
    router.refresh();
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:px-5">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <ColorPicker value={color} onChange={setColor} label={`Colour for ${label.name}`} />
          <div className="min-w-0 flex-1">
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              maxLength={LABEL_NAME_MAX_LENGTH}
              aria-label="Label name"
              invalid={Boolean(error)}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setEditing(false);
                }
              }}
            />
            {error ? (
              <p role="alert" className="mt-1 text-xs font-medium text-danger">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GroupSelect value={group} onChange={setGroup} label={`Group for ${label.name}`} />
          <Button type="submit" size="icon" loading={pending} aria-label="Save label">
            <Check aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setEditing(false)} disabled={pending} aria-label="Cancel editing">
            <X aria-hidden />
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="group flex min-w-0 items-center gap-3 px-4 py-2.5 transition-colors duration-(--dur-2) hover:bg-surface-2/50 sm:px-5">
      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{label.name}</p>
        <p className="truncate text-xs tabular-nums text-fg-muted">{usageText(label)}</p>
      </div>
      {isAdmin ? (
        <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity duration-(--dur-2) sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 pointer-coarse:opacity-100">
          <Button variant="ghost" size="icon" onClick={startEditing} aria-label={`Edit ${label.name}`} className="size-8">
            <Pencil aria-hidden />
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Delete ${label.name}`} className="size-8 hover:text-danger">
                <Trash2 aria-hidden />
              </Button>
            }
            title={`Delete "${label.name}"?`}
            description={
              label.project_count + label.task_count > 0
                ? `It comes off ${usageText(label).replace(" · ", " and ")}. This cannot be undone.`
                : "This cannot be undone."
            }
            confirmLabel="Delete label"
            destructive
            onConfirm={remove}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Settings > Labels: the catalogue grouped Tech stack / Domain / General with
 * usage counts. Members add labels; admins also rename, recolour, regroup and
 * delete them (deleting removes the label from every project and task).
 */
export function LabelsManager({ labels, isAdmin }: LabelsManagerProps) {
  const router = useRouter();
  const uid = useId();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [group, setGroup] = useState<LabelGroup>("general");
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const previewColor = color ?? colorFromString(name.trim() || "label", LABEL_COLORS);
  const term = query.trim().toLowerCase();
  const groups = useMemo(
    () =>
      LABEL_GROUP_ORDER.map((labelGroup) => ({
        group: labelGroup,
        labels: labels.filter(
          (label) => label.label_group === labelGroup && (!term || label.name.toLowerCase().includes(term)),
        ),
      })).filter((entry) => entry.labels.length > 0),
    [labels, term],
  );

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the label a name.");
      return;
    }
    const existing = labels.find((label) => label.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setError(`"${existing.name}" already exists.`);
      return;
    }
    startTransition(async () => {
      const result = await createLabelAction({ name: trimmed, label_group: group, color: previewColor });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Added "${result.data.name}"`);
      setName("");
      setColor(null);
      setError(null);
      router.refresh();
    });
  }

  return (
    <div>
      <CardContent className="space-y-4 border-b border-border pt-5">
        <form onSubmit={create} className="space-y-1.5">
          <label htmlFor={`${uid}-name`} className="text-sm font-medium text-fg">
            Add a label
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <ColorPicker value={previewColor} onChange={setColor} label="Colour for the new label" />
              <Input
                id={`${uid}-name`}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
                placeholder="Label name"
                maxLength={LABEL_NAME_MAX_LENGTH}
                autoComplete="off"
                invalid={Boolean(error)}
                className="min-w-0 flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <GroupSelect value={group} onChange={setGroup} label="Group for the new label" />
              <Button type="submit" loading={pending} className="shrink-0">
                <Plus aria-hidden />
                Add
              </Button>
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          ) : (
            <p className="text-xs text-fg-muted">
              {isAdmin ? "Everyone can add labels. Only admins rename, recolour or delete them." : "Only admins rename, recolour or delete labels."}
            </p>
          )}
        </form>

        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${pluralize(labels.length, "label")}`}
            aria-label="Search labels"
            autoComplete="off"
            className="pl-8"
          />
        </div>
      </CardContent>

      {groups.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-fg-muted">{term ? "No labels match." : "No labels yet. Add the first one."}</p>
      ) : (
        <div className="divide-y divide-border">
          {groups.map((entry) => {
            const config = LABEL_GROUP_CONFIG[entry.group];
            const headingId = `${uid}-${entry.group}`;
            return (
              <section key={entry.group} aria-labelledby={headingId}>
                <h3
                  id={headingId}
                  className="flex items-center gap-2 bg-surface-2/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-fg-muted sm:px-5"
                >
                  <Icon name={config.icon} className="size-3.5" aria-hidden />
                  {config.label}
                  <span className="font-normal normal-case tracking-normal text-fg-subtle">· {entry.labels.length}</span>
                </h3>
                <Stagger className="divide-y divide-border">
                  {entry.labels.map((label) => (
                    <StaggerItem key={label.id}>
                      <LabelRow label={label} isAdmin={isAdmin} />
                    </StaggerItem>
                  ))}
                </Stagger>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
