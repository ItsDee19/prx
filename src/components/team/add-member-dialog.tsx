"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { createUserAction } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Role } from "@/lib/types";
import { createUserSchema, fieldErrorsFromIssues } from "@/lib/validation";
import { TemporaryPasswordField } from "./temporary-password-field";

interface FormValues {
  name: string;
  email: string;
  job_title: string;
  role: Role;
  password: string;
}

const EMPTY: FormValues = { name: "", email: "", job_title: "", role: "member", password: "" };

/** Admin-only "Add member" button + dialog. Creates the user via createUserAction. */
export function AddMemberDialog() {
  const router = useRouter();
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const id = (field: keyof FormValues) => `${baseId}-${field}`;

  function set<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function reset() {
    setValues(EMPTY);
    setErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = createUserSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFromIssues(parsed.error.issues));
      return;
    }

    setPending(true);
    try {
      const result = await createUserAction({
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
        role: parsed.data.role,
        job_title: parsed.data.job_title ?? null,
      });
      if (!result.ok) {
        const fieldErrors = result.fieldErrors ?? {};
        setErrors(fieldErrors);
        // Only show the banner when the message is not already shown under a field.
        if (Object.keys(fieldErrors).length === 0) setFormError(result.error);
        return;
      }
      toast.success(`${result.data.name} was added to the team`, {
        description: "Share the temporary password with them privately.",
      });
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const roleHint = values.role === "admin" ? "Admins can manage members and delete any project." : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden />
          Add member
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a team member"
        description="Create an account for a colleague. They sign in with the temporary password and can change it afterwards."
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError ? (
            <p
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
            >
              {formError}
            </p>
          ) : null}

          <FormField label="Full name" htmlFor={id("name")} error={errors.name} required>
            <Input
              id={id("name")}
              name="name"
              autoComplete="off"
              autoFocus
              value={values.name}
              invalid={Boolean(errors.name)}
              disabled={pending}
              onChange={(event) => set("name", event.target.value)}
              aria-describedby={errors.name ? `${id("name")}-error` : undefined}
            />
          </FormField>

          <FormField label="Email" htmlFor={id("email")} error={errors.email} required>
            <Input
              id={id("email")}
              name="email"
              type="email"
              autoComplete="off"
              inputMode="email"
              placeholder="name@avlysai.com"
              value={values.email}
              invalid={Boolean(errors.email)}
              disabled={pending}
              onChange={(event) => set("email", event.target.value)}
              aria-describedby={errors.email ? `${id("email")}-error` : undefined}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Job title" htmlFor={id("job_title")} error={errors.job_title}>
              <Input
                id={id("job_title")}
                name="job_title"
                autoComplete="off"
                placeholder="e.g. ML Engineer"
                value={values.job_title}
                invalid={Boolean(errors.job_title)}
                disabled={pending}
                onChange={(event) => set("job_title", event.target.value)}
                aria-describedby={errors.job_title ? `${id("job_title")}-error` : undefined}
              />
            </FormField>

            <FormField label="Role" htmlFor={id("role")} error={errors.role} hint={roleHint}>
              <NativeSelect
                id={id("role")}
                name="role"
                value={values.role}
                invalid={Boolean(errors.role)}
                disabled={pending}
                onChange={(event) => set("role", event.target.value as Role)}
                aria-describedby={
                  errors.role ? `${id("role")}-error` : roleHint ? `${id("role")}-hint` : undefined
                }
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </NativeSelect>
            </FormField>
          </div>

          <TemporaryPasswordField
            id={id("password")}
            label="Temporary password"
            value={values.password}
            onChange={(value) => set("password", value)}
            error={errors.password}
            disabled={pending}
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              Add member
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
