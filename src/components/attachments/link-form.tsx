"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { createLinkAttachmentAction } from "@/actions/attachments";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { LINK_TYPE_CONFIG, LINK_TYPE_ORDER } from "@/lib/constants";
import type { Attachment, LinkType } from "@/lib/types";
import { cn, detectLinkType, isHttpUrl } from "@/lib/utils";
import { hostOf } from "./attachment-utils";

/**
 * Adds `https://` to a bare host such as "github.com/org/repo"; leaves any
 * other scheme alone so isHttpUrl rejects it (javascript:, data:, ftp:, ...).
 */
export function normalizeLinkInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (/^[^\s/]+\.[^\s/]{2,}/.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export interface LinkFormProps {
  projectId: string;
  taskId?: string | null;
  /** Starts with "Show in Key links" on (project-level links only). */
  defaultPinned?: boolean;
  /** Shows the "Show in Key links" switch (project-level links only); without it `defaultPinned` is sent as is. */
  allowPin?: boolean;
  /** Narrow layout for popovers. */
  compact?: boolean;
  submitLabel?: string;
  onAdded?: (attachment: Attachment) => void;
  onCancel?: () => void;
  /** Wraps the actions (dialogs pass their sticky footer). */
  renderActions?: (actions: ReactNode) => ReactNode;
  className?: string;
}

/** Link fields: URL (http/https only), optional name, type (auto-detected) and the key-link switch. */
export function LinkForm({
  projectId,
  taskId = null,
  defaultPinned = false,
  allowPin = taskId === null,
  compact = false,
  submitLabel = "Add link",
  onAdded,
  onCancel,
  renderActions,
  className,
}: LinkFormProps) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<LinkType | "auto">("auto");
  const [pinned, setPinned] = useState(defaultPinned);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const normalized = normalizeLinkInput(url);
  const valid = isHttpUrl(normalized);
  const detected = valid ? detectLinkType(normalized) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalized) {
      setError("Paste a link.");
      return;
    }
    if (!valid) {
      setError("Links must start with http:// or https://.");
      return;
    }
    setPending(true);
    setError(null);
    setNameError(null);
    const result = await createLinkAttachmentAction({
      project_id: projectId,
      task_id: taskId,
      url: normalized,
      name: name.trim() || undefined,
      link_type: type === "auto" ? null : type,
      pinned: allowPin ? pinned : defaultPinned,
    });
    setPending(false);
    if (!result.ok) {
      if (result.fieldErrors?.url) setError(result.fieldErrors.url);
      else if (result.fieldErrors?.name) setNameError(result.fieldErrors.name);
      else toast.error(result.error);
      return;
    }
    toast.success(result.data.pinned ? "Key link added." : "Link added.");
    setUrl("");
    setName("");
    setType("auto");
    setPinned(defaultPinned);
    onAdded?.(result.data);
  }

  const actions = (
    <>
      {onCancel ? (
        <Button variant="outline" disabled={pending} onClick={onCancel} size={compact ? "sm" : "md"}>
          Cancel
        </Button>
      ) : null}
      <Button type="submit" loading={pending} size={compact ? "sm" : "md"}>
        {submitLabel}
      </Button>
    </>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className={cn("space-y-4", compact && "space-y-3", className)}>
      <FormField label="Link" htmlFor={`${id}-url`} error={error} required>
        <Input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoFocus
          placeholder="https://github.com/avlysai/app"
          value={url}
          invalid={Boolean(error)}
          aria-describedby={error ? `${id}-url-error` : undefined}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError(null);
          }}
        />
      </FormField>
      <div className={cn("grid gap-4", !compact && "sm:grid-cols-2", compact && "gap-3")}>
        <FormField label="Name" htmlFor={`${id}-name`} error={nameError} hint={compact ? undefined : "Optional. Defaults to the site."}>
          <Input
            id={`${id}-name`}
            autoComplete="off"
            placeholder={valid ? hostOf(normalized) : "Staging app"}
            maxLength={200}
            value={name}
            invalid={Boolean(nameError)}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField label="Type" htmlFor={`${id}-type`}>
          <NativeSelect
            id={`${id}-type`}
            value={type}
            onChange={(event) => setType(event.target.value as LinkType | "auto")}
          >
            <option value="auto">{detected ? `Auto (${LINK_TYPE_CONFIG[detected].label})` : "Auto-detect"}</option>
            {LINK_TYPE_ORDER.map((value) => (
              <option key={value} value={value}>
                {LINK_TYPE_CONFIG[value].label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {allowPin ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
          <label htmlFor={`${id}-pin`} className="min-w-0 cursor-pointer">
            <span className="block text-sm font-medium text-fg">Show in Key links</span>
            {compact ? null : (
              <span className="block text-xs text-fg-muted">Pinned links sit on the project overview.</span>
            )}
          </label>
          <Switch id={`${id}-pin`} checked={pinned} onCheckedChange={setPinned} />
        </div>
      ) : null}
      {renderActions ? renderActions(actions) : <div className="flex justify-end gap-2">{actions}</div>}
    </form>
  );
}
