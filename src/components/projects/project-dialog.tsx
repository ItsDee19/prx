"use client";

import { useEffect, useId, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  createProjectAction,
  getProjectCommercialAction,
  getProjectFormOptionsAction,
  updateProjectAction,
} from "@/actions/projects";
import { LabelPicker } from "@/components/labels/label-picker";
import { Reveal } from "@/components/motion";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { UserPicker } from "@/components/ui/user-picker";
import {
  BUDGET_PERIOD_CONFIG,
  CURRENCY_CONFIG,
  CURRENCY_ORDER,
  DEFAULT_NEW_PROJECT_PROGRESS_MODE,
  DELIVERY_STATE_CONFIG,
  DELIVERY_STATE_ORDER,
  ENGAGEMENT_TYPE_CONFIG,
  ENGAGEMENT_TYPE_ORDER,
  PRIORITY_CONFIG,
  PROGRESS_MODE_CONFIG,
  PROGRESS_MODE_ORDER,
  PROJECT_COLORS,
  SERVICE_LINE_CONFIG,
  SERVICE_LINE_ORDER,
  STATUS_CONFIG,
  STATUS_ORDER,
} from "@/lib/constants";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import {
  PRIORITIES,
  type ActionResult,
  type BudgetPeriod,
  type ClientSummary,
  type CreateProjectFullInput,
  type Currency,
  type DeliveryState,
  type EngagementType,
  type LabelSummary,
  type Priority,
  type ProgressMode,
  type ProjectStatus,
  type ProjectWithMeta,
  type ServiceLine,
  type UpdateProjectFullInput,
  type UserSummary,
} from "@/lib/types";
import { clampProgress, cn } from "@/lib/utils";
import { fieldErrorsFromIssues, projectInputSchema, updateProjectSchema } from "@/lib/validation";

export interface ProjectDialogProps {
  mode: "create" | "edit";
  /** Required in edit mode. */
  project?: ProjectWithMeta;
  /** Create mode: parent of the new sub-project. */
  parentId?: string | null;
  parentName?: string | null;
  users: UserSummary[];
  /** Single element that opens the dialog (rendered with `asChild`). Optional for controlled hosts. */
  trigger?: ReactNode;
  /** Create mode: initial status (e.g. the board column the "+ Add" came from). */
  defaultStatus?: ProjectStatus;
  onSuccess?: (id: string) => void;
  /** Create mode: initial values (e.g. `{ client_id }` from a client page). */
  defaults?: Partial<CreateProjectFullInput>;
  /** Create mode: rendered first (template picker); `next(prefill)` moves to the details form. */
  startStep?: (api: { next: (prefill: Partial<CreateProjectFullInput>) => void }) => ReactNode;
  /** Create mode: replaces createProjectAction (templates). */
  createAction?: (input: CreateProjectFullInput) => Promise<ActionResult<{ id: string }>>;
  /** Rendered below the start and due dates with the live form values (template schedule preview). */
  detailsAside?: (values: Partial<CreateProjectFullInput>) => ReactNode;
  /** Controlled open state (hosts that open the dialog from a command). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface FormValues {
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  owner_id: string;
  member_ids: string[];
  start_date: string;
  due_date: string;
  progress: number;
  color: string | null;
  client_id: string;
  service_line: ServiceLine | "";
  engagement_type: EngagementType | "";
  currency: Currency | "";
  delivery_state: DeliveryState;
  progress_mode: ProgressMode;
  budget_hours: string;
  budget_period: BudgetPeriod;
  label_ids: string[];
  /** Admin only, typed as text ("15L", "12,00,000"). */
  contract_value: string;
  hourly_rate: string;
}

interface FormOptions {
  clients: ClientSummary[];
  labels: LabelSummary[];
  isAdmin: boolean;
}

type FieldErrors = Record<string, string>;

const COLOR_NAMES: Record<string, string> = {
  "#5b5bd6": "Indigo",
  "#0ea5e9": "Sky",
  "#10b981": "Emerald",
  "#f59e0b": "Amber",
  "#ef4444": "Red",
  "#ec4899": "Pink",
  "#8b5cf6": "Violet",
  "#14b8a6": "Teal",
};

/** Fields that live in the collapsible "Engagement and budget" section. */
const ENGAGEMENT_SECTION_FIELDS = [
  "engagement_type",
  "delivery_state",
  "currency",
  "progress_mode",
  "budget_hours",
  "budget_period",
  "contract_value",
  "hourly_rate",
] as const;

const BUDGET_PERIOD_OPTIONS: { value: BudgetPeriod; label: string }[] = [
  { value: "total", label: BUDGET_PERIOD_CONFIG.total.label },
  { value: "monthly", label: BUDGET_PERIOD_CONFIG.monthly.label },
];

function colorName(hex: string): string {
  return COLOR_NAMES[hex.toLowerCase()] ?? hex;
}

/**
 * Date inputs: never wider than their column (iOS Safari otherwise sizes them
 * to their intrinsic width), and on iOS drop the native pill styling so they
 * match the other fields. `@supports (-webkit-touch-callout: none)` only
 * matches iOS/iPadOS WebKit.
 */
const DATE_INPUT_CLASS = "min-w-0 supports-[-webkit-touch-callout:none]:appearance-none";

function amountText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function initialValues(
  project: ProjectWithMeta | undefined,
  defaultStatus: ProjectStatus | undefined,
  defaults: Partial<CreateProjectFullInput> | undefined,
): FormValues {
  if (project) {
    return {
      name: project.name,
      description: project.description,
      status: project.status,
      priority: project.priority,
      owner_id: project.owner_id ?? "",
      member_ids: project.members.map((member) => member.id),
      start_date: project.start_date ?? "",
      due_date: project.due_date ?? "",
      progress: project.progress,
      color: project.color,
      client_id: project.client_id ?? "",
      service_line: project.service_line ?? "",
      engagement_type: project.engagement_type ?? "",
      currency: project.currency ?? "",
      delivery_state: project.delivery_state,
      progress_mode: project.progress_mode,
      budget_hours: project.budget_hours === null ? "" : String(project.budget_hours),
      budget_period: project.budget_period,
      label_ids: project.labels.map((label) => label.id),
      contract_value: amountText(project.contract_value),
      hourly_rate: amountText(project.hourly_rate),
    };
  }
  const d = defaults ?? {};
  return {
    name: d.name ?? "",
    description: d.description ?? "",
    status: d.status ?? defaultStatus ?? "to_start",
    priority: d.priority ?? "medium",
    owner_id: d.owner_id ?? "",
    member_ids: d.member_ids ?? [],
    start_date: d.start_date ?? "",
    due_date: d.due_date ?? "",
    progress: d.progress ?? 0,
    color: d.color ?? null,
    client_id: d.client_id ?? "",
    service_line: d.service_line ?? "",
    engagement_type: d.engagement_type ?? "",
    currency: d.currency ?? "",
    delivery_state: d.delivery_state ?? "not_started",
    progress_mode: d.progress_mode ?? DEFAULT_NEW_PROJECT_PROGRESS_MODE,
    budget_hours: d.budget_hours === null || d.budget_hours === undefined ? "" : String(d.budget_hours),
    budget_period: d.budget_period ?? "total",
    label_ids: d.label_ids ?? [],
    contract_value: amountText(d.contract_value),
    hourly_rate: amountText(d.hourly_rate),
  };
}

/** Prefill from a start step (template) merged into the current form values. */
function mergePrefill(values: FormValues, prefill: Partial<CreateProjectFullInput>): FormValues {
  const next = { ...values };
  if (prefill.name !== undefined) next.name = prefill.name;
  if (prefill.description !== undefined) next.description = prefill.description;
  if (prefill.status !== undefined) next.status = prefill.status;
  if (prefill.priority !== undefined) next.priority = prefill.priority;
  if (prefill.owner_id !== undefined) next.owner_id = prefill.owner_id ?? "";
  if (prefill.member_ids !== undefined) next.member_ids = prefill.member_ids;
  if (prefill.start_date !== undefined) next.start_date = prefill.start_date ?? "";
  if (prefill.due_date !== undefined) next.due_date = prefill.due_date ?? "";
  if (prefill.color !== undefined) next.color = prefill.color;
  if (prefill.client_id !== undefined) next.client_id = prefill.client_id ?? "";
  if (prefill.service_line !== undefined) next.service_line = prefill.service_line ?? "";
  if (prefill.engagement_type !== undefined) next.engagement_type = prefill.engagement_type ?? "";
  if (prefill.currency !== undefined) next.currency = prefill.currency ?? "";
  if (prefill.delivery_state !== undefined) next.delivery_state = prefill.delivery_state;
  if (prefill.progress_mode !== undefined) next.progress_mode = prefill.progress_mode;
  if (prefill.budget_hours !== undefined) next.budget_hours = prefill.budget_hours === null ? "" : String(prefill.budget_hours);
  if (prefill.budget_period !== undefined) next.budget_period = prefill.budget_period;
  if (prefill.label_ids !== undefined) next.label_ids = prefill.label_ids;
  return next;
}

function hasEngagementDetails(values: FormValues): boolean {
  return (
    values.engagement_type !== "" ||
    values.currency !== "" ||
    values.budget_hours !== "" ||
    values.delivery_state !== "not_started" ||
    values.contract_value !== "" ||
    values.hourly_rate !== ""
  );
}

/** Budget hours: "" -> null, whole non-negative number -> value, anything else -> NaN (invalid). */
function parseHours(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** Money text: "" -> null, parsed amount, or NaN when it cannot be read. */
function parseAmount(text: string): number | null {
  if (text.trim() === "") return null;
  return parseMoneyInput(text) ?? Number.NaN;
}

/**
 * Create / edit form for a project or sub-project (a client engagement in
 * v2). Basics first (name, client, service line, dates, people, labels); the
 * engagement and budget fields sit in a collapsible section so a quick
 * project stays quick. Contract value and hourly rate show only for admins and
 * are never sent by members. Validation mirrors the server schema.
 */
export function ProjectDialog({
  mode,
  project,
  parentId = null,
  parentName = null,
  users,
  trigger,
  defaultStatus,
  onSuccess,
  defaults,
  startStep,
  createAction,
  detailsAside,
  open: controlledOpen,
  onOpenChange,
}: ProjectDialogProps) {
  const router = useRouter();
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const isEdit = mode === "edit";
  const hasStartStep = !isEdit && startStep !== undefined;

  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const [values, setValues] = useState<FormValues>(() => initialValues(project, defaultStatus, defaults));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<"start" | "details">(hasStartStep ? "start" : "details");
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [options, setOptions] = useState<FormOptions | null>(null);
  /** Edit mode, admins: the stored amounts (loaded on open); amounts are sent only once these are known. */
  const [storedAmounts, setStoredAmounts] = useState<{ contract_value: number | null; hourly_rate: number | null } | null>(null);
  const [amountsTouched, setAmountsTouched] = useState(false);
  const [pending, startTransition] = useTransition();

  // Fresh form every time the dialog opens (controlled or not): blank / defaults
  // for create, re-synced to the project for edit.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      const fresh = initialValues(project, defaultStatus, defaults);
      setValues(fresh);
      setErrors({});
      setFormError(null);
      setStep(hasStartStep ? "start" : "details");
      setEngagementOpen(isEdit && hasEngagementDetails(fresh));
      setCurrencyTouched(false);
      setStoredAmounts(null);
      setAmountsTouched(false);
    }
  }

  // Clients, labels and whether amounts are shown load when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getProjectFormOptionsAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setOptions(result.data);
      else toast.error(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Admins editing: read the stored amounts so the form shows (and restates) the real values.
  const projectId = project?.id;
  const loadAmounts = open && isEdit && options?.isAdmin === true && projectId !== undefined;
  useEffect(() => {
    if (!loadAmounts || !projectId) return;
    let cancelled = false;
    getProjectCommercialAction(projectId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setStoredAmounts({ contract_value: result.data.contract_value, hourly_rate: result.data.hourly_rate });
    });
    return () => {
      cancelled = true;
    };
  }, [loadAmounts, projectId]);

  // Show the stored amounts unless the admin already typed over them.
  const [syncedAmounts, setSyncedAmounts] = useState(storedAmounts);
  if (storedAmounts !== syncedAmounts) {
    setSyncedAmounts(storedAmounts);
    if (storedAmounts && !amountsTouched) {
      setValues((current) => ({
        ...current,
        contract_value: amountText(storedAmounts.contract_value),
        hourly_rate: amountText(storedAmounts.hourly_rate),
      }));
    }
  }

  const isAdmin = options?.isAdmin === true;
  const clients = useMemo(() => {
    const list = options?.clients ?? [];
    // An archived client stays selectable on the projects that already use it.
    if (project?.client && !list.some((client) => client.id === project.client?.id)) return [...list, project.client];
    return list;
  }, [options, project]);
  const labels = useMemo(() => {
    const list: LabelSummary[] = options?.labels ?? [];
    const missing = (project?.labels ?? []).filter((label) => !list.some((item) => item.id === label.id));
    return [...list, ...missing];
  }, [options, project]);

  const title = isEdit ? "Edit project" : parentId ? `New sub-project in ${parentName ?? "project"}` : "New project";

  function setOpen(next: boolean) {
    if (pending) return;
    if (controlledOpen === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  }

  function clearError(key: string) {
    if (!errors[key]) return;
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    clearError(key);
  }

  function setClient(clientId: string) {
    setValues((current) => {
      const next = { ...current, client_id: clientId };
      // New engagements bill in the client's currency unless the currency was picked by hand.
      const client = clients.find((item) => item.id === clientId);
      if (client && !currencyTouched && (!isEdit || current.currency === "")) next.currency = client.currency;
      return next;
    });
    clearError("client_id");
  }

  function setCurrency(currency: Currency | "") {
    setCurrencyTouched(true);
    update("currency", currency);
    clearError("contract_value");
    clearError("hourly_rate");
  }

  function toggleMember(id: string, checked: boolean) {
    setValues((current) => ({
      ...current,
      member_ids: checked
        ? current.member_ids.includes(id)
          ? current.member_ids
          : [...current.member_ids, id]
        : current.member_ids.filter((memberId) => memberId !== id),
    }));
  }

  /** The live values in the action's shape (for detailsAside and submission). */
  function liveInput(): Partial<CreateProjectFullInput> {
    const hours = parseHours(values.budget_hours);
    return {
      name: values.name,
      description: values.description,
      status: values.status,
      priority: values.priority,
      owner_id: values.owner_id || null,
      member_ids: values.member_ids,
      start_date: values.start_date || null,
      due_date: values.due_date || null,
      color: values.color,
      client_id: values.client_id || null,
      service_line: values.service_line || null,
      engagement_type: values.engagement_type || null,
      currency: values.currency || null,
      delivery_state: values.delivery_state,
      progress_mode: values.progress_mode,
      budget_hours: hours !== null && Number.isNaN(hours) ? null : hours,
      budget_period: values.budget_period,
      label_ids: values.label_ids,
      parent_id: parentId,
    };
  }

  /** Client-side checks the schema cannot do (text inputs for hours and money). */
  function localErrors(): FieldErrors {
    const found: FieldErrors = {};
    if (Number.isNaN(parseHours(values.budget_hours))) found.budget_hours = "Enter whole hours, e.g. 120";
    if (isAdmin) {
      const contract = parseAmount(values.contract_value);
      const hourly = parseAmount(values.hourly_rate);
      if (Number.isNaN(contract)) found.contract_value = "Enter an amount like 15,00,000, 15L or 45000";
      if (Number.isNaN(hourly)) found.hourly_rate = "Enter an amount like 2500";
      // On create, an empty currency may still come from the client or the parent project (server side).
      const currencyFromServer = !isEdit && (values.client_id !== "" || parentId !== null);
      if ((contract !== null || hourly !== null) && values.currency === "" && !currencyFromServer) {
        found.currency = "Pick a currency before entering amounts.";
      }
    }
    return found;
  }

  function buildCreateInput(): CreateProjectFullInput {
    const base = liveInput();
    const input: CreateProjectFullInput = {
      name: values.name,
      description: values.description,
      status: values.status,
      priority: values.priority,
      owner_id: base.owner_id,
      member_ids: values.member_ids,
      start_date: base.start_date,
      due_date: base.due_date,
      color: values.color,
      parent_id: parentId,
      engagement_type: base.engagement_type,
      delivery_state: values.delivery_state,
      progress_mode: values.progress_mode,
      budget_hours: base.budget_hours,
      budget_period: values.budget_period,
      label_ids: values.label_ids,
    };
    if (values.progress_mode === "manual") input.progress = values.progress;
    // Left out when empty so a sub-project inherits them from its parent (and currency from the client).
    if (values.client_id) input.client_id = values.client_id;
    if (values.service_line) input.service_line = values.service_line;
    // An empty choice means "inherit" on create ("Client's currency" / "None"), so the key is left out
    // and the server takes the parent's or client's currency.
    if (values.currency) input.currency = values.currency;
    if (isAdmin) {
      const contract = parseAmount(values.contract_value);
      const hourly = parseAmount(values.hourly_rate);
      if (contract !== null) input.contract_value = contract;
      if (hourly !== null) input.hourly_rate = hourly;
    }
    return input;
  }

  function buildUpdatePatch(): UpdateProjectFullInput {
    const base = liveInput();
    const patch: UpdateProjectFullInput = {
      name: values.name,
      description: values.description,
      status: values.status,
      priority: values.priority,
      owner_id: base.owner_id,
      member_ids: values.member_ids,
      start_date: base.start_date,
      due_date: base.due_date,
      color: values.color,
      client_id: base.client_id,
      service_line: base.service_line,
      engagement_type: base.engagement_type,
      currency: base.currency,
      delivery_state: values.delivery_state,
      progress_mode: values.progress_mode,
      budget_hours: base.budget_hours,
      budget_period: values.budget_period,
      label_ids: values.label_ids,
    };
    if (values.progress_mode === "manual") patch.progress = values.progress;
    // Admins restate both amounts on every save (so a currency change is explicit), but only once the
    // stored amounts are known: a stripped project prop must never wipe them with nulls.
    if (isAdmin && storedAmounts !== null) {
      patch.contract_value = parseAmount(values.contract_value);
      patch.hourly_rate = parseAmount(values.hourly_rate);
    }
    return patch;
  }

  function showErrors(fieldErrors: FieldErrors, fallback: string | null) {
    setErrors(fieldErrors);
    setFormError(fieldErrors._form ?? fallback);
    if (ENGAGEMENT_SECTION_FIELDS.some((key) => fieldErrors[key])) setEngagementOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const local = localErrors();
    if (Object.keys(local).length > 0) {
      showErrors(local, null);
      return;
    }

    const input = isEdit ? null : buildCreateInput();
    const patch = isEdit ? buildUpdatePatch() : null;
    const parsed = isEdit ? updateProjectSchema.safeParse(patch) : projectInputSchema.safeParse(input);
    if (!parsed.success) {
      showErrors(fieldErrorsFromIssues(parsed.error.issues), null);
      return;
    }

    startTransition(async () => {
      let id: string;
      if (isEdit && project && patch) {
        const result = await updateProjectAction(project.id, patch);
        if (!result.ok) return showErrors(result.fieldErrors ?? {}, result.error);
        id = project.id;
      } else if (input) {
        const result = await (createAction ?? createProjectAction)(input);
        if (!result.ok) return showErrors(result.fieldErrors ?? {}, result.error);
        id = result.data.id;
      } else {
        return;
      }

      toast.success(isEdit ? "Project updated" : parentId ? "Sub-project created" : "Project created");
      if (controlledOpen === undefined) setInnerOpen(false);
      onOpenChange?.(false);
      router.refresh();
      onSuccess?.(id);
    });
  }

  const membersLabelId = fieldId("members-label");
  const ownerLabelId = fieldId("owner-label");
  const colorLabelId = fieldId("color-label");
  const labelsLabelId = fieldId("labels-label");
  const engagementId = fieldId("engagement");

  const selectedClient = clients.find((client) => client.id === values.client_id) ?? null;
  const currencySymbol = values.currency ? CURRENCY_CONFIG[values.currency].symbol : "¤";
  const contractPreview = parseAmount(values.contract_value);
  const hourlyPreview = parseAmount(values.hourly_rate);

  const engagementSummary = [
    values.engagement_type ? ENGAGEMENT_TYPE_CONFIG[values.engagement_type].label : null,
    values.delivery_state !== "not_started" ? DELIVERY_STATE_CONFIG[values.delivery_state].label : null,
    values.currency || null,
    values.budget_hours.trim()
      ? `${values.budget_hours.trim()} h ${values.budget_period === "monthly" ? "per month" : "total"}`
      : null,
    PROGRESS_MODE_CONFIG[values.progress_mode].label,
  ].filter((part): part is string => Boolean(part));

  const content =
    step === "start" && startStep ? (
      startStep({
        next: (prefill) => {
          setValues((current) => mergePrefill(current, prefill));
          setStep("details");
        },
      })
    ) : (
      <form onSubmit={handleSubmit} noValidate className="space-y-4 sm:space-y-5">
        {formError ? (
          <div
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger [overflow-wrap:anywhere]"
          >
            {formError}
          </div>
        ) : null}

        <FormField label="Name" htmlFor={fieldId("name")} error={errors.name} required>
          <Input
            id={fieldId("name")}
            name="name"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="Engagement name"
            maxLength={120}
            autoFocus
            autoComplete="off"
            invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? `${fieldId("name")}-error` : undefined}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Client"
            htmlFor={fieldId("client")}
            error={errors.client_id}
            hint={!isEdit && parentId && !values.client_id ? "Empty: same client as the parent." : undefined}
            className="min-w-0"
          >
            <NativeSelect
              id={fieldId("client")}
              value={values.client_id}
              onChange={(event) => setClient(event.target.value)}
              invalid={Boolean(errors.client_id)}
              disabled={options === null && clients.length === 0}
              className="truncate"
            >
              <option value="">{options === null ? "Loading clients…" : "No client"}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.code} · {client.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Service line" htmlFor={fieldId("service")} error={errors.service_line} className="min-w-0">
            <NativeSelect
              id={fieldId("service")}
              value={values.service_line}
              onChange={(event) => update("service_line", event.target.value as ServiceLine | "")}
              invalid={Boolean(errors.service_line)}
            >
              <option value="">{!isEdit && parentId ? "Same as parent" : "Not set"}</option>
              {SERVICE_LINE_ORDER.map((value) => (
                <option key={value} value={value}>
                  {SERVICE_LINE_CONFIG[value].label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>

        <FormField label="Description" htmlFor={fieldId("description")} error={errors.description}>
          <Textarea
            id={fieldId("description")}
            name="description"
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="What does the client need? What does done look like?"
            rows={3}
            maxLength={5000}
            invalid={Boolean(errors.description)}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Status" htmlFor={fieldId("status")} error={errors.status} className="min-w-0">
            <NativeSelect
              id={fieldId("status")}
              name="status"
              value={values.status}
              onChange={(event) => update("status", event.target.value as ProjectStatus)}
              invalid={Boolean(errors.status)}
            >
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_CONFIG[status].label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Priority" htmlFor={fieldId("priority")} error={errors.priority} className="min-w-0">
            <NativeSelect
              id={fieldId("priority")}
              name="priority"
              value={values.priority}
              onChange={(event) => update("priority", event.target.value as Priority)}
              invalid={Boolean(errors.priority)}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_CONFIG[priority].label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <p id={ownerLabelId} className="select-none text-sm font-medium leading-5 text-fg">
              Owner
            </p>
            <UserPicker
              users={users}
              value={values.owner_id || null}
              onChange={(id) => update("owner_id", id ?? "")}
              allowUnassigned
              placeholder="Unassigned"
              aria-label="Owner"
            />
            {errors.owner_id ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.owner_id}
              </p>
            ) : null}
          </div>

          <div className="min-w-0 space-y-1.5">
            <p id={membersLabelId} className="select-none text-sm font-medium leading-5 text-fg">
              Members
              {values.member_ids.length > 0 ? (
                <span className="ml-1.5 text-xs font-normal text-fg-muted">{values.member_ids.length} selected</span>
              ) : null}
            </p>
            <div
              role="group"
              aria-labelledby={membersLabelId}
              className="max-h-40 overflow-y-auto rounded-md border border-border bg-surface p-1"
            >
              {users.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-fg-muted">No active users yet.</p>
              ) : (
                users.map((user) => {
                  const id = fieldId(`member-${user.id}`);
                  const checked = values.member_ids.includes(user.id);
                  return (
                    <label
                      key={user.id}
                      htmlFor={id}
                      className={cn(
                        "flex min-w-0 cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-surface-2",
                        "pointer-coarse:py-2.5",
                        checked && "text-fg",
                      )}
                    >
                      <Checkbox id={id} checked={checked} onChange={(event) => toggleMember(user.id, event.target.checked)} />
                      <UserAvatar user={user} size="xs" />
                      <span className="min-w-0 flex-1 truncate">{user.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Start date" htmlFor={fieldId("start")} error={errors.start_date} className="min-w-0">
            <Input
              id={fieldId("start")}
              name="start_date"
              type="date"
              value={values.start_date}
              onChange={(event) => update("start_date", event.target.value)}
              invalid={Boolean(errors.start_date)}
              className={DATE_INPUT_CLASS}
            />
          </FormField>
          <FormField label="Due date" htmlFor={fieldId("due")} error={errors.due_date} className="min-w-0">
            <Input
              id={fieldId("due")}
              name="due_date"
              type="date"
              min={values.start_date || undefined}
              value={values.due_date}
              onChange={(event) => update("due_date", event.target.value)}
              invalid={Boolean(errors.due_date)}
              className={DATE_INPUT_CLASS}
            />
          </FormField>
        </div>

        {detailsAside ? <div className="min-w-0">{detailsAside(liveInput())}</div> : null}

        <div className="space-y-1.5">
          <p id={labelsLabelId} className="select-none text-sm font-medium leading-5 text-fg">
            Labels
          </p>
          <LabelPicker
            labels={labels}
            value={values.label_ids}
            onChange={(ids) => update("label_ids", ids)}
            aria-label="Labels"
            className="w-full"
          />
          {errors.label_ids ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {errors.label_ids}
            </p>
          ) : null}
        </div>

        {/* Engagement and budget: collapsed until needed so a quick project stays quick. */}
        <div className="rounded-xl border border-border bg-surface-2/40">
          <button
            type="button"
            aria-expanded={engagementOpen}
            aria-controls={engagementId}
            onClick={() => setEngagementOpen((current) => !current)}
            className="flex w-full min-w-0 items-center gap-3 rounded-xl px-3.5 py-3 text-left outline-none transition-colors duration-150 hover:bg-surface-2/70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-fg">Engagement and budget</span>
              <span className="block truncate text-xs text-fg-muted">
                {engagementSummary.join(" · ")}
                {isAdmin ? " · Commercial terms" : ""}
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 shrink-0 text-fg-subtle transition-transform duration-(--dur-3) ease-out-quart",
                engagementOpen && "rotate-180",
              )}
            />
          </button>
          {engagementOpen ? (
            <Reveal y={4} className="space-y-4 border-t border-border px-3.5 pb-4 pt-3.5">
              <div id={engagementId} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    label="Engagement type"
                    htmlFor={fieldId("engagement-type")}
                    error={errors.engagement_type}
                    hint={values.engagement_type ? ENGAGEMENT_TYPE_CONFIG[values.engagement_type].description : undefined}
                    className="min-w-0"
                  >
                    <NativeSelect
                      id={fieldId("engagement-type")}
                      value={values.engagement_type}
                      onChange={(event) => update("engagement_type", event.target.value as EngagementType | "")}
                      invalid={Boolean(errors.engagement_type)}
                    >
                      <option value="">Not set</option>
                      {ENGAGEMENT_TYPE_ORDER.map((value) => (
                        <option key={value} value={value}>
                          {ENGAGEMENT_TYPE_CONFIG[value].label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField
                    label="Delivery state"
                    htmlFor={fieldId("delivery")}
                    error={errors.delivery_state}
                    className="min-w-0"
                  >
                    <NativeSelect
                      id={fieldId("delivery")}
                      value={values.delivery_state}
                      onChange={(event) => update("delivery_state", event.target.value as DeliveryState)}
                      invalid={Boolean(errors.delivery_state)}
                    >
                      {DELIVERY_STATE_ORDER.map((value) => (
                        <option key={value} value={value}>
                          {DELIVERY_STATE_CONFIG[value].label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    label="Currency"
                    htmlFor={fieldId("currency")}
                    error={errors.currency}
                    hint={
                      selectedClient && values.currency === selectedClient.currency
                        ? `${selectedClient.code} bills in ${selectedClient.currency}.`
                        : "INR and USD are always reported separately."
                    }
                    className="min-w-0"
                  >
                    <NativeSelect
                      id={fieldId("currency")}
                      value={values.currency}
                      onChange={(event) => setCurrency(event.target.value as Currency | "")}
                      invalid={Boolean(errors.currency)}
                    >
                      <option value="">{!isEdit && (parentId || values.client_id) ? "Client's currency" : "None"}</option>
                      {CURRENCY_ORDER.map((value) => (
                        <option key={value} value={value}>
                          {value} · {CURRENCY_CONFIG[value].label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                  <FormField
                    label="Progress"
                    htmlFor={fieldId("progress-mode")}
                    error={errors.progress_mode}
                    hint={PROGRESS_MODE_CONFIG[values.progress_mode].description}
                    className="min-w-0"
                  >
                    <NativeSelect
                      id={fieldId("progress-mode")}
                      value={values.progress_mode}
                      onChange={(event) => update("progress_mode", event.target.value as ProgressMode)}
                      invalid={Boolean(errors.progress_mode)}
                    >
                      {PROGRESS_MODE_ORDER.map((value) => (
                        <option key={value} value={value}>
                          {PROGRESS_MODE_CONFIG[value].label}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    label="Hours budget"
                    htmlFor={fieldId("budget")}
                    error={errors.budget_hours}
                    hint="Burn is tracked against logged time."
                    className="min-w-0"
                  >
                    <div className="relative">
                      <Input
                        id={fieldId("budget")}
                        inputMode="numeric"
                        value={values.budget_hours}
                        onChange={(event) => update("budget_hours", event.target.value)}
                        placeholder="Hours"
                        autoComplete="off"
                        invalid={Boolean(errors.budget_hours)}
                        className="pr-9 tabular-nums"
                      />
                      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">
                        h
                      </span>
                    </div>
                  </FormField>
                  <div className="min-w-0 space-y-1.5">
                    <p className="select-none text-sm font-medium leading-5 text-fg">Budget period</p>
                    <SegmentedControl
                      ariaLabel="Budget period"
                      value={values.budget_period}
                      onChange={(value) => update("budget_period", value)}
                      options={BUDGET_PERIOD_OPTIONS}
                      className="h-9 w-full px-1 [&>button]:flex-1"
                    />
                  </div>
                </div>

                {isAdmin ? (
                  <div className="space-y-3 rounded-lg border border-dashed border-border bg-surface px-3 py-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                      <Lock className="size-3.5" aria-hidden />
                      Commercial terms. Only admins see these.
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField
                        label="Contract value"
                        htmlFor={fieldId("contract")}
                        error={errors.contract_value}
                        hint={
                          contractPreview !== null && !Number.isNaN(contractPreview) && values.currency
                            ? formatMoney(contractPreview, values.currency, { withCode: true })
                            : "Accepts 15,00,000, 15L, 2Cr or 45K."
                        }
                        className="min-w-0"
                      >
                        <div className="relative">
                          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">
                            {currencySymbol}
                          </span>
                          <Input
                            id={fieldId("contract")}
                            inputMode="decimal"
                            value={values.contract_value}
                            onChange={(event) => {
                              setAmountsTouched(true);
                              update("contract_value", event.target.value);
                            }}
                            disabled={isEdit && storedAmounts === null}
                            placeholder="0"
                            autoComplete="off"
                            invalid={Boolean(errors.contract_value)}
                            className="pl-7 tabular-nums"
                          />
                        </div>
                      </FormField>
                      <FormField
                        label="Hourly rate"
                        htmlFor={fieldId("hourly")}
                        error={errors.hourly_rate}
                        hint={
                          hourlyPreview !== null && !Number.isNaN(hourlyPreview) && values.currency
                            ? `${formatMoney(hourlyPreview, values.currency)} per hour`
                            : "For time and materials work."
                        }
                        className="min-w-0"
                      >
                        <div className="relative">
                          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">
                            {currencySymbol}
                          </span>
                          <Input
                            id={fieldId("hourly")}
                            inputMode="decimal"
                            value={values.hourly_rate}
                            onChange={(event) => {
                              setAmountsTouched(true);
                              update("hourly_rate", event.target.value);
                            }}
                            disabled={isEdit && storedAmounts === null}
                            placeholder="0"
                            autoComplete="off"
                            invalid={Boolean(errors.hourly_rate)}
                            className="pl-7 tabular-nums"
                          />
                        </div>
                      </FormField>
                    </div>
                    {!values.currency && (values.contract_value || values.hourly_rate) ? (
                      <p className="text-xs text-warning">Amounts need a currency. Pick one above.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Reveal>
          ) : null}
        </div>

        {values.progress_mode === "manual" ? (
          <FormField label="Progress" htmlFor={fieldId("progress")} error={errors.progress}>
            <div className="flex min-w-0 items-center gap-3">
              {/* `w-full` keeps the slider from adding intrinsic width on a narrow sheet; 32px tall on touch. */}
              <input
                id={fieldId("progress")}
                name="progress"
                type="range"
                min={0}
                max={100}
                step={1}
                value={values.progress}
                onChange={(event) => update("progress", clampProgress(Number(event.target.value)))}
                className="h-2 w-full min-w-0 flex-1 cursor-pointer accent-accent outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface pointer-coarse:h-8"
              />
              <div className="flex shrink-0 items-center gap-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  aria-label="Progress percentage"
                  value={values.progress}
                  onChange={(event) =>
                    update("progress", event.target.value === "" ? 0 : clampProgress(Number(event.target.value)))
                  }
                  invalid={Boolean(errors.progress)}
                  className="w-20 text-right tabular-nums"
                />
                <span className="text-sm text-fg-muted" aria-hidden>
                  %
                </span>
              </div>
            </div>
          </FormField>
        ) : null}

        <div className="space-y-1.5">
          <p id={colorLabelId} className="select-none text-sm font-medium leading-5 text-fg">
            Colour
          </p>
          {/* Wraps onto a second row on phones; 40px swatches with wider gaps on touch screens. */}
          <div role="radiogroup" aria-labelledby={colorLabelId} className="flex flex-wrap items-center gap-2 pointer-coarse:gap-3">
            <button
              type="button"
              role="radio"
              aria-checked={values.color === null}
              aria-label="No colour"
              onClick={() => update("color", null)}
              className={cn(
                "flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors duration-150 outline-none",
                "pointer-coarse:h-10 pointer-coarse:px-3.5",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                values.color === null
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              None
            </button>
            {PROJECT_COLORS.map((hex) => {
              const selected = values.color?.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={colorName(hex)}
                  title={colorName(hex)}
                  onClick={() => update("color", hex)}
                  style={{ backgroundColor: hex }}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-white outline-none transition-transform duration-(--dur-2) ease-spring",
                    "pointer-coarse:size-10",
                    "hover:scale-110 active:scale-95 motion-reduce:hover:scale-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                    selected && "ring-2 ring-fg ring-offset-2 ring-offset-surface",
                  )}
                >
                  {selected ? <Check className="size-4" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
          {errors.color ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {errors.color}
            </p>
          ) : null}
        </div>

        <DialogFooter className="mt-2">
          {hasStartStep ? (
            <Button variant="ghost" disabled={pending} onClick={() => setStep("start")} className="w-full sm:mr-auto sm:w-auto">
              <ArrowLeft aria-hidden />
              Back
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button variant="outline" disabled={pending} className="w-full sm:w-auto">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" loading={pending} className="w-full sm:w-auto">
            {isEdit ? "Save changes" : parentId ? "Create sub-project" : "Create project"}
          </Button>
        </DialogFooter>
      </form>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      {/* The parent name is user content: an unbroken 120-character name wraps instead of widening the
          sheet, and on phones the (non-scrolling) header is capped at 3 lines; screen readers get it all. */}
      <DialogContent
        title={<span className="line-clamp-3 [overflow-wrap:anywhere] sm:line-clamp-none">{title}</span>}
        size="lg"
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
