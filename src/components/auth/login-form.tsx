"use client";

import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { AuthLink } from "@/components/auth/auth-link";
import { FormError } from "@/components/auth/form-error";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { INITIAL_FORM_STATE } from "@/lib/types";

export interface LoginFormProps {
  /** Path to return to after signing in (from `?next=`); forwarded as a hidden field. */
  next?: string;
  /** True when the previous session expired or was revoked (from `?expired=1`). */
  expired?: boolean;
}

export function LoginForm({ next, expired }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_FORM_STATE);
  const errors = state.fieldErrors ?? {};
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <form action={formAction} noValidate className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {expired && !state.error ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg-muted"
        >
          Your session has expired. Please sign in again.
        </p>
      ) : null}

      <FormError message={state.error} />

      <FormField label="Email" htmlFor="login-email" error={errors.email}>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          inputMode="email"
          spellCheck={false}
          placeholder="you@avlysai.com"
          defaultValue={state.values?.email ?? ""}
          invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "login-email-error" : undefined}
        />
      </FormField>

      <FormField label="Password" htmlFor="login-password" error={errors.password}>
        <PasswordInput
          id="login-password"
          name="password"
          autoComplete="current-password"
          placeholder="Your password"
          invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "login-password-error" : undefined}
        />
      </FormField>

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Sign in
      </Button>

      <p className="text-center text-sm text-fg-muted">
        Don&apos;t have an account? <AuthLink href={registerHref}>Create one</AuthLink>
      </p>
    </form>
  );
}
