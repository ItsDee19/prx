"use client";

import { useId, useState } from "react";
import { BadgeCheck, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { APPROVER_NAME_MAX } from "@/lib/schemas/tasks";
import { formatDate } from "@/lib/utils";
import type { TaskDrawerSectionProps } from "../drawer-sections";
import { useSaveTask } from "../task-inline-editors";

/** Who on the client side approved the deliverable, and when. */
export function TaskApprovalSection({ task, today, onChanged }: TaskDrawerSectionProps) {
  const save = useSaveTask(() => onChanged());
  const nameId = useId();
  const dateId = useId();
  const [name, setName] = useState(task.approved_by_name ?? "");
  const [date, setDate] = useState(task.approved_on ?? "");
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState(task);
  if (synced !== task) {
    setSynced(task);
    setName(task.approved_by_name ?? "");
    setDate(task.approved_on ?? "");
  }

  const dirty = name.trim() !== (task.approved_by_name ?? "") || date !== (task.approved_on ?? "");
  const approved = task.approved_by_name !== null;
  const missingName = date !== "" && name.trim() === "";

  async function submit() {
    if (!dirty || missingName) return;
    setSaving(true);
    await save(task.id, { approved_by_name: name.trim() || null, approved_on: date || null });
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      {approved ? (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success ring-1 ring-inset ring-success/25">
          <BadgeCheck aria-hidden className="size-3.5" />
          Approved by {task.approved_by_name}
          {task.approved_on ? ` on ${formatDate(task.approved_on)}` : ""}
        </p>
      ) : (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning ring-1 ring-inset ring-warning/25">
          <Hourglass aria-hidden className="size-3.5" />
          Awaiting client approval
        </p>
      )}
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField label="Approved by" htmlFor={nameId} error={missingName ? "Add who approved it." : undefined}>
          <Input
            id={nameId}
            value={name}
            maxLength={APPROVER_NAME_MAX}
            placeholder="Client contact"
            invalid={missingName}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField label="Approved on" htmlFor={dateId}>
          <Input id={dateId} type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2 sm:col-span-2">
          {dirty ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setName(task.approved_by_name ?? "");
                setDate(task.approved_on ?? "");
              }}
            >
              Reset
            </Button>
          ) : null}
          <Button type="submit" size="sm" loading={saving} disabled={!dirty || missingName}>
            {approved ? "Update approval" : "Record approval"}
          </Button>
        </div>
      </form>
    </div>
  );
}
