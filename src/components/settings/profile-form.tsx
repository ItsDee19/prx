"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { updateProfileAction } from "@/actions/users";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { AVATAR_COLORS } from "@/lib/constants";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fieldErrorsFromIssues, profileSchema } from "@/lib/validation";

/** Human names for the palette so the swatches have meaningful accessible labels. */
const COLOR_NAMES: Record<string, string> = {
  "#5b5bd6": "Indigo",
  "#0ea5e9": "Sky",
  "#10b981": "Emerald",
  "#f59e0b": "Amber",
  "#ef4444": "Red",
  "#ec4899": "Pink",
  "#8b5cf6": "Violet",
  "#14b8a6": "Teal",
  "#f97316": "Orange",
  "#64748b": "Slate",
};

function colorName(hex: string): string {
  return COLOR_NAMES[hex.toLowerCase()] ?? hex;
}

interface ProfileValues {
  name: string;
  job_title: string;
  color: string;
}

function fromUser(user: Pick<User, "name" | "job_title" | "color">): ProfileValues {
  return { name: user.name, job_title: user.job_title ?? "", color: user.color };
}

function isSame(a: ProfileValues, b: ProfileValues): boolean {
  return a.name === b.name && a.job_title === b.job_title && a.color === b.color;
}

export interface ProfileFormProps {
  user: User;
}

/** Name, job title and avatar colour. Email is shown read-only. */
export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const baseId = useId();
  const [saved, setSaved] = useState<ProfileValues>(() => fromUser(user));
  const [values, setValues] = useState<ProfileValues>(() => fromUser(user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const swatchRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const dirty = !isSame(values, saved);
  const nameId = `${baseId}-name`;
  const jobId = `${baseId}-job`;
  const emailId = `${baseId}-email`;
  const colorLabelId = `${baseId}-color-label`;

  // The palette may not contain a colour assigned before the palette changed; keep it selectable.
  const palette = AVATAR_COLORS.includes(values.color) ? AVATAR_COLORS : [values.color, ...AVATAR_COLORS];

  function set<K extends keyof ProfileValues>(field: K, value: ProfileValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function handleSwatchKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % palette.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index - 1 + palette.length) % palette.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = palette.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    set("color", palette[next]);
    swatchRefs.current[next]?.focus();
  }

  function reset() {
    setValues(saved);
    setErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }

    setPending(true);
    try {
      const result = await updateProfileAction({
        name: parsed.data.name,
        job_title: parsed.data.job_title ?? null,
        color: parsed.data.color,
      });
      if (!result.ok) {
        const fieldErrors = result.fieldErrors ?? {};
        setErrors(fieldErrors);
        if (Object.keys(fieldErrors).length === 0) setFormError(result.error);
        return;
      }
      const next = fromUser(result.data);
      setSaved(next);
      setValues(next);
      toast.success("Profile saved");
      router.refresh();
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const preview = { name: values.name.trim() || user.name, color: values.color };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <CardContent className="space-y-5">
        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
          >
            {formError}
          </p>
        ) : null}

        <div className="flex items-start gap-4">
          <UserAvatar user={preview} size="lg" className="mt-0.5 size-14 text-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <span id={colorLabelId} className="block select-none text-sm font-medium leading-5 text-fg">
              Avatar colour
            </span>
            <div
              role="radiogroup"
              aria-labelledby={colorLabelId}
              className="flex flex-wrap gap-2"
            >
              {palette.map((hex, index) => {
                const selected = hex === values.color;
                return (
                  <button
                    key={hex}
                    ref={(el) => {
                      swatchRefs.current[index] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={colorName(hex)}
                    title={colorName(hex)}
                    tabIndex={selected ? 0 : -1}
                    disabled={pending}
                    style={{ backgroundColor: hex }}
                    onClick={() => set("color", hex)}
                    onKeyDown={(event) => handleSwatchKeyDown(event, index)}
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-full text-white outline-none",
                      "transition-[transform,box-shadow] duration-150 hover:scale-105",
                      "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                      "disabled:cursor-not-allowed disabled:opacity-50",
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" htmlFor={nameId} error={errors.name} required>
            <Input
              id={nameId}
              name="name"
              autoComplete="name"
              value={values.name}
              invalid={Boolean(errors.name)}
              disabled={pending}
              onChange={(event) => set("name", event.target.value)}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
            />
          </FormField>

          <FormField label="Job title" htmlFor={jobId} error={errors.job_title}>
            <Input
              id={jobId}
              name="job_title"
              autoComplete="organization-title"
              placeholder="e.g. ML Engineer"
              value={values.job_title}
              invalid={Boolean(errors.job_title)}
              disabled={pending}
              onChange={(event) => set("job_title", event.target.value)}
              aria-describedby={errors.job_title ? `${jobId}-error` : undefined}
            />
          </FormField>
        </div>

        <FormField label="Email" htmlFor={emailId} hint="Your email is your sign-in and cannot be changed here. Ask an admin if it needs updating.">
          <Input
            id={emailId}
            name="email"
            type="email"
            value={user.email}
            readOnly
            aria-readonly="true"
            aria-describedby={`${emailId}-hint`}
            className="cursor-default bg-surface-2 text-fg-muted hover:border-border focus-visible:ring-accent/30"
          />
        </FormField>
      </CardContent>

      <CardFooter className="justify-end">
        {dirty ? (
          <Button variant="ghost" onClick={reset} disabled={pending}>
            Discard
          </Button>
        ) : null}
        <Button type="submit" loading={pending} disabled={!dirty}>
          Save changes
        </Button>
      </CardFooter>
    </form>
  );
}
