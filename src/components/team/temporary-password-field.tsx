"use client";

import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { generatePassword } from "./generate-password";

export interface TemporaryPasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
  /** Text under the field; defaults to a reminder to share the password. */
  hint?: string;
}

/**
 * Password input with Generate / Copy / show-hide controls. The generated value
 * is shown in clear text because the admin has to hand it to the person.
 */
export function TemporaryPasswordField({
  id,
  label,
  value,
  onChange,
  error,
  disabled = false,
  hint = `At least ${MIN_PASSWORD_LENGTH} characters. Share it with the person privately; they can change it in Settings.`,
}: TemporaryPasswordFieldProps) {
  const [visible, setVisible] = useState(true);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Password copied to clipboard");
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  }

  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint} required className="min-w-0">
      {/*
        Phones: the input gets the full width so the whole generated password is readable,
        with Generate / Copy as two equal labelled buttons underneath.
        sm and up: one row - input, Generate, icon-only Copy (label in a tooltip + sr-only text).
      */}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 sm:flex-1">
          <Input
            id={id}
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            invalid={Boolean(error)}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
            className="block pr-9 font-mono pointer-coarse:pr-11"
          />
          {/* Full input height; 44px wide on touch screens. The inset ring keeps focus inside the field. */}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            disabled={disabled}
            className="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center rounded-r-md text-fg-muted outline-none transition-colors duration-150 hover:text-fg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-50 pointer-coarse:w-11"
          >
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => {
              onChange(generatePassword());
              setVisible(true);
            }}
            className="w-full sm:w-auto"
          >
            <RefreshCw aria-hidden />
            Generate
          </Button>
          <Tooltip content="Copy password">
            <Button
              variant="outline"
              aria-label="Copy password"
              disabled={disabled || value.length === 0}
              onClick={copy}
              className="w-full sm:w-9 sm:px-0"
            >
              <Copy aria-hidden />
              <span className="sm:sr-only">Copy</span>
            </Button>
          </Tooltip>
        </div>
      </div>
    </FormField>
  );
}
