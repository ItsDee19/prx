"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { registerAction } from "@/actions/auth";
import { AuthLink } from "@/components/auth/auth-link";
import { FormError } from "@/components/auth/form-error";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { INITIAL_FORM_STATE } from "@/lib/types";

export interface RegisterFormProps {
  /** Email domains allowed to self-register; empty means any domain. */
  allowedDomains: string[];
  /** True when no account exists yet, so this one will become the admin. */
  isFirstUser: boolean;
  /** Optional `?next=` to keep on the link back to /login. */
  next?: string;
}

function formatDomains(domains: string[]): string {
  const list = domains.map((d) => `@${d}`);
  if (list.length <= 1) return list.join("");
  if (list.length === 2) return `${list[0]} or ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
}

export function RegisterForm({ allowedDomains, isFirstUser, next }: RegisterFormProps) {
  const [state, formAction, pending] = useActionState(registerAction, INITIAL_FORM_STATE);
  const errors = state.fieldErrors ?? {};
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  const domainNote =
    allowedDomains.length > 0 ? `Only ${formatDomains(allowedDomains)} addresses can register` : null;
  const emailPlaceholder = allowedDomains.length > 0 ? `you@${allowedDomains[0]}` : "you@example.com";

  return (
    <form action={formAction} noValidate className="space-y-5">
      {isFirstUser ? (
        <div className="flex items-start gap-2.5 rounded-md border border-accent/25 bg-accent-soft px-3 py-2.5 text-sm text-fg">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="min-w-0 leading-5">
            <span className="font-medium">The first account created becomes the admin.</span>{" "}
            <span className="text-fg-muted">You will be able to invite and manage the rest of the team.</span>
          </p>
        </div>
      ) : null}

      <FormError message={state.error} />

      <FormField label="Full name" htmlFor="register-name" error={errors.name}>
        <Input
          id="register-name"
          name="name"
          type="text"
          autoComplete="name"
          autoFocus
          placeholder="Ada Lovelace"
          defaultValue={state.values?.name ?? ""}
          invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "register-name-error" : undefined}
        />
      </FormField>

      <FormField label="Work email" htmlFor="register-email" error={errors.email} hint={domainNote}>
        <Input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          placeholder={emailPlaceholder}
          defaultValue={state.values?.email ?? ""}
          invalid={Boolean(errors.email)}
          aria-describedby={
            errors.email ? "register-email-error" : domainNote ? "register-email-hint" : undefined
          }
        />
      </FormField>

      <FormField
        label="Password"
        htmlFor="register-password"
        error={errors.password}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
      >
        <PasswordInput
          id="register-password"
          name="password"
          autoComplete="new-password"
          placeholder="Create a password"
          invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "register-password-error" : "register-password-hint"}
        />
      </FormField>

      <FormField label="Confirm password" htmlFor="register-confirm" error={errors.confirm_password}>
        <PasswordInput
          id="register-confirm"
          name="confirm_password"
          autoComplete="new-password"
          placeholder="Repeat your password"
          invalid={Boolean(errors.confirm_password)}
          aria-describedby={errors.confirm_password ? "register-confirm-error" : undefined}
        />
      </FormField>

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Create account
      </Button>

      <p className="text-center text-sm text-fg-muted">
        Already have an account? <AuthLink href={loginHref}>Sign in</AuthLink>
      </p>
    </form>
  );
}
