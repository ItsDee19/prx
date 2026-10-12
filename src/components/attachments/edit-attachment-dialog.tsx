"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { updateAttachmentAction } from "@/actions/attachments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { LINK_TYPE_CONFIG, LINK_TYPE_ORDER } from "@/lib/constants";
import type { Attachment, LinkType } from "@/lib/types";

export interface EditAttachmentDialogProps {
  attachment: Attachment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (attachment: Attachment) => void;
}

/** Rename an attachment; links can also change type. */
export function EditAttachmentDialog({ attachment, open, onOpenChange, onSaved }: EditAttachmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={attachment.kind === "link" ? "Edit link" : "Rename file"} size="sm">
        {/* Remount per open so the fields start from the current values. */}
        {open ? (
          <EditForm attachment={attachment} onCancel={() => onOpenChange(false)} onSaved={(saved) => {
            onOpenChange(false);
            onSaved?.(saved);
          }} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  attachment,
  onCancel,
  onSaved,
}: {
  attachment: Attachment;
  onCancel: () => void;
  onSaved: (attachment: Attachment) => void;
}) {
  const id = useId();
  const [name, setName] = useState(attachment.name);
  const [type, setType] = useState<LinkType>(attachment.link_type ?? "other");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give it a name.");
      return;
    }
    const patch: { name?: string; link_type?: LinkType } = {};
    if (trimmed !== attachment.name) patch.name = trimmed;
    if (attachment.kind === "link" && type !== attachment.link_type) patch.link_type = type;
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    setPending(true);
    const result = await updateAttachmentAction(attachment.id, patch);
    setPending(false);
    if (!result.ok) {
      if (result.fieldErrors?.name) setError(result.fieldErrors.name);
      else toast.error(result.error);
      return;
    }
    toast.success("Saved.");
    onSaved(result.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormField label="Name" htmlFor={`${id}-name`} error={error} required>
        <Input
          id={`${id}-name`}
          autoFocus
          maxLength={200}
          value={name}
          invalid={Boolean(error)}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError(null);
          }}
        />
      </FormField>
      {attachment.kind === "link" ? (
        <FormField label="Type" htmlFor={`${id}-type`}>
          <NativeSelect id={`${id}-type`} value={type} onChange={(event) => setType(event.target.value as LinkType)}>
            {LINK_TYPE_ORDER.map((value) => (
              <option key={value} value={value}>
                {LINK_TYPE_CONFIG[value].label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      ) : null}
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
