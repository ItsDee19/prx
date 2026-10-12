"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { changePasswordAction } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

interface PasswordValues {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

const EMPTY: PasswordValues = { current_password: "", new_password: "", confirm_password: "" };

/** Current / new / confirm. Validates locally, then calls changePasswordAction. */
export function PasswordForm() {
  const baseId = useId();
  const [values, setValues] = useState<PasswordValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const id = (field: keyof PasswordValues) => `${baseId}-${field}`;
  const filled = Object.values(values).every((value) => value.length > 0);

  function set<K extends keyof PasswordValues>(field: K, value: PasswordValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!values.current_password) next.current_password = "Enter your current password";
    if (values.new_password.length < MIN_PASSWORD_LENGTH) {
      next.new_password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    } else if (values.new_password.length > 128) {
      next.new_password = "Password must be 128 characters or fewer";
    } else if (values.current_password && values.new_password === values.current_password) {
      next.new_password = "New password must be different from your current password";
    }
    if (!values.confirm_password) next.confirm_password = "Please confirm your new password";
    else if (values.confirm_password !== values.new_password) next.confirm_password = "Passwords do not match";
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setPending(true);
    try {
      const result = await changePasswordAction({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      if (!result.ok) {
        const fieldErrors = result.fieldErrors ?? {};
        setErrors(fieldErrors);
        if (Object.keys(fieldErrors).length === 0) setFormError(result.error);
        return;
      }
      setValues(EMPTY);
      setErrors({});
      setShowNew(false);
      toast.success("Password changed", { description: "Use your new password next time you sign in." });
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <CardContent className="space-y-4 pt-5">
        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger"
          >
            {formError}
          </p>
        ) : null}

        {/*
          Stacked on phones. From sm a two-column grid: current password takes
          the first cell on its own row, new + confirm share the next row, so
          every field has the same comfortable width.
        */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Current password"
            htmlFor={id("current_password")}
            error={errors.current_password}
            required
          >
            <Input
              id={id("current_password")}
              name="current_password"
              type="password"
              autoComplete="current-password"
              value={values.current_password}
              invalid={Boolean(errors.current_password)}
              disabled={pending}
              onChange={(event) => set("current_password", event.target.value)}
              aria-describedby={errors.current_password ? `${id("current_password")}-error` : undefined}
            />
          </FormField>

          <FormField
            label="New password"
            htmlFor={id("new_password")}
            error={errors.new_password}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            required
            className="sm:col-start-1"
          >
            <div className="relative">
              <Input
                id={id("new_password")}
                name="new_password"
                type={showNew ? "text" : "password"}
                autoComplete="new-password"
                value={values.new_password}
                invalid={Boolean(errors.new_password)}
                disabled={pending}
                onChange={(event) => set("new_password", event.target.value)}
                aria-describedby={
                  errors.new_password ? `${id("new_password")}-error` : `${id("new_password")}-hint`
                }
                className="pr-9 pointer-coarse:pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                aria-label={showNew ? "Hide new password" : "Show new password"}
                aria-pressed={showNew}
                disabled={pending}
                className="absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-fg-muted outline-none transition-colors duration-150 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 pointer-coarse:right-0.5 pointer-coarse:size-8"
              >
                {showNew ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
          </FormField>

          <FormField
            label="Confirm new password"
            htmlFor={id("confirm_password")}
            error={errors.confirm_password}
            required
          >
            <Input
              id={id("confirm_password")}
              name="confirm_password"
              type={showNew ? "text" : "password"}
              autoComplete="new-password"
              value={values.confirm_password}
              invalid={Boolean(errors.confirm_password)}
              disabled={pending}
              onChange={(event) => set("confirm_password", event.target.value)}
              aria-describedby={errors.confirm_password ? `${id("confirm_password")}-error` : undefined}
            />
          </FormField>
        </div>
      </CardContent>

      <CardFooter className="justify-end">
        <Button type="submit" loading={pending} disabled={!filled}>
          Change password
        </Button>
      </CardFooter>
    </form>
  );
}
