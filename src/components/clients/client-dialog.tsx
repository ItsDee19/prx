"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { createClientAction, suggestClientCodeAction, updateClientAction } from "@/actions/clients";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { CLIENT_COLORS, CLIENT_REGION_CONFIG, CURRENCY_CONFIG, CURRENCY_ORDER } from "@/lib/constants";
import { CLIENT_SYSTEMS_MAX, CLIENT_SYSTEM_NAME_MAX, createClientSchema, updateClientSchema } from "@/lib/schemas/clients";
import type { Client, ClientRegion, CreateClientInput, Currency } from "@/lib/types";
import { cn, colorFromString } from "@/lib/utils";
import { fieldErrorsFromIssues } from "@/lib/validation";

export interface ClientDialogProps {
  mode: "create" | "edit";
  /** Required in edit mode. */
  client?: Client;
  /** Single element that opens the dialog (rendered with `asChild`). Optional for controlled hosts. */
  trigger?: ReactNode;
  onSuccess?: (id: string) => void;
  /** Controlled open state (NewClientDialogHost). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface FormValues {
  name: string;
  code: string;
  industry: string;
  region: ClientRegion;
  currency: Currency;
  website: string;
  contact_name: string;
  contact_email: string;
  contact_role: string;
  systems: string[];
  nda_signed: boolean;
  dpa_signed: boolean;
  confidential: boolean;
  color: string | null;
  notes: string;
}

type FieldErrors = Record<string, string>;

const SUGGEST_DEBOUNCE_MS = 350;
const DETAIL_FIELDS = ["website", "contact_name", "contact_email", "contact_role", "systems", "notes"] as const;

const REGION_OPTIONS: { value: ClientRegion; label: string }[] = [
  { value: "india", label: CLIENT_REGION_CONFIG.india.label },
  { value: "international", label: CLIENT_REGION_CONFIG.international.label },
];

const CURRENCY_OPTIONS: { value: Currency; label: string }[] = CURRENCY_ORDER.map((value) => ({
  value,
  label: `${CURRENCY_CONFIG[value].symbol} ${value}`,
}));

function initialValues(client: Client | undefined): FormValues {
  return {
    name: client?.name ?? "",
    code: client?.code ?? "",
    industry: client?.industry ?? "",
    region: client?.region ?? "india",
    currency: client?.currency ?? "INR",
    website: client?.website ?? "",
    contact_name: client?.contact_name ?? "",
    contact_email: client?.contact_email ?? "",
    contact_role: client?.contact_role ?? "",
    systems: client?.systems ?? [],
    nda_signed: client?.nda_signed ?? false,
    dpa_signed: client?.dpa_signed ?? false,
    confidential: client?.confidential ?? false,
    color: client?.color ?? null,
    notes: client?.notes ?? "",
  };
}

function toInput(values: FormValues): CreateClientInput {
  return {
    name: values.name,
    code: values.code,
    industry: values.industry,
    region: values.region,
    currency: values.currency,
    website: values.website || null,
    contact_name: values.contact_name || null,
    contact_email: values.contact_email || null,
    contact_role: values.contact_role || null,
    systems: values.systems,
    nda_signed: values.nda_signed,
    dpa_signed: values.dpa_signed,
    confidential: values.confidential,
    color: values.color ?? colorFromString(values.name.trim() || values.code, CLIENT_COLORS),
    notes: values.notes,
  };
}

/** Free-text tags: Enter or comma adds, Backspace on an empty field removes the last one. */
function SystemsInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string[];
  onChange: (systems: string[]) => void;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, CLIENT_SYSTEM_NAME_MAX);
    if (!name || value.length >= CLIENT_SYSTEMS_MAX) return;
    if (!value.some((item) => item.toLowerCase() === name.toLowerCase())) onChange([...value, name]);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-surface px-2 py-1.5 transition-[border-color,box-shadow] duration-150",
        "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30",
        invalid ? "border-danger" : "border-input-border hover:border-border-strong",
      )}
    >
      {value.map((system) => (
        <span
          key={system}
          className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-surface-2 pl-2 pr-1 text-xs font-medium text-fg ring-1 ring-inset ring-border"
        >
          <span className="truncate">{system}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((item) => item !== system))}
            aria-label={`Remove ${system}`}
            className="relative flex size-4 shrink-0 items-center justify-center rounded-full text-fg-muted outline-none transition-colors duration-150 hover:bg-border hover:text-fg focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => add(draft)}
        placeholder={value.length === 0 ? "HubSpot, Zendesk, SAP…" : "Add another"}
        autoComplete="off"
        maxLength={CLIENT_SYSTEM_NAME_MAX}
        className="h-6 min-w-24 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle sm:text-sm"
      />
    </div>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-sm font-medium text-fg">{label}</span>
        <span className="block text-xs text-fg-muted">{description}</span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
    </div>
  );
}

/**
 * Create / edit a client. The short code is suggested from the name until it
 * is edited by hand; the currency follows the region until it is picked.
 * Contacts, systems and notes sit behind "More details".
 */
export function ClientDialog({ mode, client, trigger, onSuccess, open: controlledOpen, onOpenChange }: ClientDialogProps) {
  const router = useRouter();
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const isEdit = mode === "edit";

  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [values, setValues] = useState<FormValues>(() => initialValues(client));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [codeTouched, setCodeTouched] = useState(isEdit);
  const [currencyTouched, setCurrencyTouched] = useState(isEdit);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [pending, startTransition] = useTransition();
  const suggestRun = useRef(0);

  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      const fresh = initialValues(client);
      setValues(fresh);
      setErrors({});
      setFormError(null);
      setCodeTouched(isEdit);
      setCurrencyTouched(isEdit);
      setDetailsOpen(isEdit && DETAIL_FIELDS.some((key) => (Array.isArray(fresh[key]) ? fresh[key].length > 0 : fresh[key] !== "")));
    }
  }

  // Suggest a code from the name while the code has not been edited by hand.
  const name = values.name.trim();
  useEffect(() => {
    if (!open || codeTouched || name.length === 0) return;
    const run = ++suggestRun.current;
    const timer = window.setTimeout(() => {
      setSuggesting(true);
      suggestClientCodeAction(name).then((result) => {
        if (run !== suggestRun.current) return;
        setSuggesting(false);
        if (result.ok) setValues((current) => ({ ...current, code: result.data }));
      });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      // Any re-run (name edited, code typed by hand, dialog closed) invalidates a pending request so
      // a late suggestion never overwrites what the user has since typed.
      window.clearTimeout(timer);
      suggestRun.current += 1;
      setSuggesting(false);
    };
  }, [name, codeTouched, open]);

  function setOpen(next: boolean) {
    if (pending) return;
    if (controlledOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  }

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function setRegion(region: ClientRegion) {
    setValues((current) => ({
      ...current,
      region,
      currency: currencyTouched ? current.currency : CLIENT_REGION_CONFIG[region].defaultCurrency,
    }));
  }

  function showErrors(fieldErrors: FieldErrors, fallback: string | null) {
    setErrors(fieldErrors);
    setFormError(fieldErrors._form ?? fallback);
    if (DETAIL_FIELDS.some((key) => fieldErrors[key])) setDetailsOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const input = toInput(values);
    const parsed = isEdit ? updateClientSchema.safeParse(input) : createClientSchema.safeParse(input);
    if (!parsed.success) {
      showErrors(fieldErrorsFromIssues(parsed.error.issues), null);
      return;
    }
    startTransition(async () => {
      const result = isEdit && client ? await updateClientAction(client.id, input) : await createClientAction(input);
      if (!result.ok) {
        showErrors(result.fieldErrors ?? {}, result.error);
        return;
      }
      toast.success(isEdit ? "Client updated" : `Client ${result.data.code} created`);
      if (controlledOpen === undefined) setInnerOpen(false);
      onOpenChange?.(false);
      router.refresh();
      onSuccess?.(result.data.id);
    });
  }

  const previewColor = values.color ?? colorFromString(values.name.trim() || "client", CLIENT_COLORS);
  const detailsId = fieldId("details");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent title={isEdit ? "Edit client" : "New client"} size="lg">
        <form onSubmit={handleSubmit} noValidate className="space-y-4 sm:space-y-5">
          {formError ? (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger [overflow-wrap:anywhere]"
            >
              {formError}
            </div>
          ) : null}

          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-6 flex size-11 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-semibold text-white shadow-card transition-colors duration-(--dur-3)"
              style={{ backgroundColor: previewColor }}
            >
              {(values.code || values.name.trim().slice(0, 2) || "?").toUpperCase().slice(0, 4)}
            </span>
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <FormField label="Name" htmlFor={fieldId("name")} error={errors.name} required className="min-w-0">
                <Input
                  id={fieldId("name")}
                  value={values.name}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder="Client organisation name"
                  maxLength={120}
                  autoFocus
                  autoComplete="off"
                  invalid={Boolean(errors.name)}
                />
              </FormField>
              <FormField
                label="Code"
                htmlFor={fieldId("code")}
                error={errors.code}
                required
                hint={!codeTouched && values.code ? (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="size-3" aria-hidden />
                    {suggesting ? "Suggesting…" : "Suggested"}
                  </span>
                ) : "2-6 letters or digits."}
                className="min-w-0"
              >
                <Input
                  id={fieldId("code")}
                  value={values.code}
                  onChange={(event) => {
                    setCodeTouched(true);
                    update("code", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
                  }}
                  placeholder="HOSP"
                  maxLength={6}
                  autoComplete="off"
                  spellCheck={false}
                  invalid={Boolean(errors.code)}
                  className="font-mono uppercase tracking-wide"
                />
              </FormField>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Industry" htmlFor={fieldId("industry")} error={errors.industry} className="min-w-0">
              <Input
                id={fieldId("industry")}
                value={values.industry}
                onChange={(event) => update("industry", event.target.value)}
                placeholder="Client's industry"
                maxLength={60}
                autoComplete="off"
                invalid={Boolean(errors.industry)}
              />
            </FormField>
            <div className="min-w-0 space-y-1.5">
              <p className="select-none text-sm font-medium leading-5 text-fg">Region and currency</p>
              <div className="flex min-w-0 flex-wrap gap-2">
                <SegmentedControl
                  ariaLabel="Region"
                  value={values.region}
                  onChange={setRegion}
                  options={REGION_OPTIONS}
                  className="h-9 min-w-0 flex-1 px-1 [&>button]:flex-1"
                />
                <SegmentedControl
                  ariaLabel="Currency"
                  value={values.currency}
                  onChange={(currency) => {
                    setCurrencyTouched(true);
                    update("currency", currency);
                  }}
                  options={CURRENCY_OPTIONS}
                  className="h-9 px-1"
                />
              </div>
              <p className="text-xs text-fg-muted">New engagements for this client default to {values.currency}.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p id={fieldId("color-label")} className="select-none text-sm font-medium leading-5 text-fg">
              Colour
            </p>
            <div role="radiogroup" aria-labelledby={fieldId("color-label")} className="flex flex-wrap items-center gap-2 pointer-coarse:gap-3">
              {CLIENT_COLORS.map((hex) => {
                const selected = (values.color ?? previewColor).toLowerCase() === hex.toLowerCase();
                return (
                  <button
                    key={hex}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`Colour ${hex}`}
                    onClick={() => update("color", hex)}
                    style={{ backgroundColor: hex }}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-white outline-none transition-transform duration-(--dur-2) ease-spring",
                      "pointer-coarse:size-10 hover:scale-110 active:scale-95 motion-reduce:hover:scale-100",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                      selected && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
                    )}
                  >
                    {selected ? <Check className="size-3.5" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border px-3.5">
            <ToggleRow
              id={fieldId("nda")}
              label="NDA signed"
              description="A non-disclosure agreement is in place."
              checked={values.nda_signed}
              onCheckedChange={(checked) => update("nda_signed", checked)}
            />
            <ToggleRow
              id={fieldId("dpa")}
              label="DPA signed"
              description="A data processing agreement covers client data."
              checked={values.dpa_signed}
              onCheckedChange={(checked) => update("dpa_signed", checked)}
            />
            <ToggleRow
              id={fieldId("confidential")}
              label="Confidential"
              description="Shown with a lock and only as its code in exports."
              checked={values.confidential}
              onCheckedChange={(checked) => update("confidential", checked)}
            />
          </div>

          <div className="rounded-xl border border-border bg-surface-2/40">
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              onClick={() => setDetailsOpen((current) => !current)}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left outline-none transition-colors duration-150 hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">More details</span>
                <span className="block truncate text-xs text-fg-muted">Contact, website, systems they run and notes.</span>
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 shrink-0 text-fg-subtle transition-transform duration-(--dur-3) ease-out-quart",
                  detailsOpen && "rotate-180",
                )}
              />
            </button>
            {detailsOpen ? (
              <Reveal y={4} className="border-t border-border px-3.5 pb-4 pt-3.5">
                <div id={detailsId} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Contact name" htmlFor={fieldId("contact-name")} error={errors.contact_name} className="min-w-0">
                      <Input
                        id={fieldId("contact-name")}
                        value={values.contact_name}
                        onChange={(event) => update("contact_name", event.target.value)}
                        maxLength={80}
                        autoComplete="off"
                        invalid={Boolean(errors.contact_name)}
                      />
                    </FormField>
                    <FormField label="Role" htmlFor={fieldId("contact-role")} error={errors.contact_role} className="min-w-0">
                      <Input
                        id={fieldId("contact-role")}
                        value={values.contact_role}
                        onChange={(event) => update("contact_role", event.target.value)}
                        placeholder="Contact's job title"
                        maxLength={80}
                        autoComplete="off"
                        invalid={Boolean(errors.contact_role)}
                      />
                    </FormField>
                    <FormField label="Contact email" htmlFor={fieldId("contact-email")} error={errors.contact_email} className="min-w-0">
                      <Input
                        id={fieldId("contact-email")}
                        type="email"
                        value={values.contact_email}
                        onChange={(event) => update("contact_email", event.target.value)}
                        autoComplete="off"
                        invalid={Boolean(errors.contact_email)}
                      />
                    </FormField>
                    <FormField label="Website" htmlFor={fieldId("website")} error={errors.website} className="min-w-0">
                      <Input
                        id={fieldId("website")}
                        value={values.website}
                        onChange={(event) => update("website", event.target.value)}
                        placeholder="company.com"
                        inputMode="url"
                        autoComplete="off"
                        invalid={Boolean(errors.website)}
                      />
                    </FormField>
                  </div>
                  <FormField
                    label="Systems they run"
                    htmlFor={fieldId("systems")}
                    error={errors.systems}
                    hint="Press Enter or comma after each one."
                  >
                    <SystemsInput
                      id={fieldId("systems")}
                      value={values.systems}
                      onChange={(systems) => update("systems", systems)}
                      invalid={Boolean(errors.systems)}
                    />
                  </FormField>
                  <FormField label="Notes" htmlFor={fieldId("notes")} error={errors.notes}>
                    <Textarea
                      id={fieldId("notes")}
                      value={values.notes}
                      onChange={(event) => update("notes", event.target.value)}
                      rows={3}
                      maxLength={5000}
                      placeholder="Billing contacts, access details, preferences."
                      invalid={Boolean(errors.notes)}
                    />
                  </FormField>
                </div>
              </Reveal>
            ) : null}
          </div>

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={pending} className="w-full sm:w-auto">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending} className="w-full sm:w-auto">
              {isEdit ? "Save changes" : "Create client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
