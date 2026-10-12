"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateAppSettingsAction } from "@/actions/app-settings";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { MAX_TUNING_DAYS, MAX_UPDATE_CADENCE_DAYS, MIN_UPDATE_CADENCE_DAYS } from "@/lib/constants";
import { updateAppSettingsSchema } from "@/lib/schemas/app-settings";
import type { UpdateAppSettingsInput } from "@/lib/types";
import { fieldErrorsFromIssues } from "@/lib/validation";

export interface WorkspaceSettingsFormProps {
  initial: {
    workspace_timezone: string;
    usd_inr_rate: number;
    default_tuning_days: number;
    update_cadence_days: number;
  };
  /** IANA zones with a display label ("Asia/Kolkata · GMT+5:30"). */
  timeZones: { value: string; label: string }[];
  /** Workspace today in the current zone, already formatted. */
  todayLabel: string;
}

interface FormValues {
  workspace_timezone: string;
  usd_inr_rate: string;
  default_tuning_days: string;
  update_cadence_days: string;
}

function toValues(initial: WorkspaceSettingsFormProps["initial"]): FormValues {
  return {
    workspace_timezone: initial.workspace_timezone,
    usd_inr_rate: String(initial.usd_inr_rate),
    default_tuning_days: String(initial.default_tuning_days),
    update_cadence_days: String(initial.update_cadence_days),
  };
}

function toNumber(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

/** Admin-only workspace configuration: time zone, USD to INR rate and delivery defaults. */
export function WorkspaceSettingsForm({ initial, timeZones, todayLabel }: WorkspaceSettingsFormProps) {
  const router = useRouter();
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const [saved, setSaved] = useState(() => toValues(initial));
  const [values, setValues] = useState(() => toValues(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const dirty = (Object.keys(values) as (keyof FormValues)[]).some((key) => values[key] !== saved[key]);

  function update(key: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: UpdateAppSettingsInput = {
      workspace_timezone: values.workspace_timezone,
      usd_inr_rate: toNumber(values.usd_inr_rate),
      default_tuning_days: toNumber(values.default_tuning_days),
      update_cadence_days: toNumber(values.update_cadence_days),
    };
    const parsed = updateAppSettingsSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }
    startTransition(async () => {
      const result = await updateAppSettingsAction(parsed.data);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      const next = toValues({
        workspace_timezone: result.data.workspace_timezone,
        usd_inr_rate: result.data.usd_inr_rate ?? toNumber(values.usd_inr_rate),
        default_tuning_days: result.data.default_tuning_days,
        update_cadence_days: result.data.update_cadence_days,
      });
      setSaved(next);
      setValues(next);
      toast.success("Workspace settings saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <CardContent className="space-y-5 pt-5">
        <FormField
          label="Time zone"
          htmlFor={fieldId("tz")}
          error={errors.workspace_timezone}
          hint={`Every "today" (overdue, due soon, countdowns) uses this zone. Today there: ${todayLabel}.`}
        >
          <NativeSelect
            id={fieldId("tz")}
            value={values.workspace_timezone}
            onChange={(event) => update("workspace_timezone", event.target.value)}
            invalid={Boolean(errors.workspace_timezone)}
            className="truncate"
          >
            {timeZones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <FormField
            label="USD to INR rate"
            htmlFor={fieldId("rate")}
            error={errors.usd_inr_rate}
            hint="Used only for the approximate margin. Admins only."
            className="min-w-0"
          >
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-subtle">
                ₹
              </span>
              <Input
                id={fieldId("rate")}
                inputMode="decimal"
                value={values.usd_inr_rate}
                onChange={(event) => update("usd_inr_rate", event.target.value)}
                invalid={Boolean(errors.usd_inr_rate)}
                className="pl-7 pr-12 tabular-nums"
              />
              <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
                per $1
              </span>
            </div>
          </FormField>
          <FormField
            label="Default tuning window"
            htmlFor={fieldId("tuning")}
            error={errors.default_tuning_days}
            hint={`Days after go-live for new projects (0 to ${MAX_TUNING_DAYS}).`}
            className="min-w-0"
          >
            <div className="relative">
              <Input
                id={fieldId("tuning")}
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_TUNING_DAYS}
                value={values.default_tuning_days}
                onChange={(event) => update("default_tuning_days", event.target.value)}
                invalid={Boolean(errors.default_tuning_days)}
                className="pr-12 tabular-nums"
              />
              <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
                days
              </span>
            </div>
          </FormField>
          <FormField
            label="Update cadence"
            htmlFor={fieldId("cadence")}
            error={errors.update_cadence_days}
            hint={`Ongoing projects show "Update due" after this many days (${MIN_UPDATE_CADENCE_DAYS} to ${MAX_UPDATE_CADENCE_DAYS}).`}
            className="min-w-0"
          >
            <div className="relative">
              <Input
                id={fieldId("cadence")}
                type="number"
                inputMode="numeric"
                min={MIN_UPDATE_CADENCE_DAYS}
                max={MAX_UPDATE_CADENCE_DAYS}
                value={values.update_cadence_days}
                onChange={(event) => update("update_cadence_days", event.target.value)}
                invalid={Boolean(errors.update_cadence_days)}
                className="pr-12 tabular-nums"
              />
              <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
                days
              </span>
            </div>
          </FormField>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        {dirty ? (
          <Button variant="ghost" onClick={() => setValues(saved)} disabled={pending}>
            Discard
          </Button>
        ) : null}
        <Button type="submit" loading={pending} disabled={!dirty}>
          Save workspace settings
        </Button>
      </CardFooter>
    </form>
  );
}
