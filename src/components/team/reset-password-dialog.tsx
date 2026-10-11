"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { resetUserPasswordAction } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import type { User } from "@/lib/types";
import { TemporaryPasswordField } from "./temporary-password-field";

export interface ResetPasswordDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Controlled dialog (opened from the member row menu) that sets a new password for a user. */
export function ResetPasswordDialog({ user, open, onOpenChange }: ResetPasswordDialogProps) {
  const router = useRouter();
  const fieldId = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close() {
    onOpenChange(false);
    setPassword("");
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password.length > 128) {
      setError("Password must be 128 characters or fewer");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const result = await resetUserPasswordAction(user.id, password);
      if (!result.ok) {
        setError(result.fieldErrors?.password ?? result.error);
        return;
      }
      toast.success(`Password reset for ${user.name}`, {
        description: "They have been signed out everywhere. Share the new password privately.",
      });
      close();
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent
        title={`Reset password for ${user.name}`}
        description="Set a temporary password. Their existing sessions are signed out immediately."
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TemporaryPasswordField
            id={`${fieldId}-password`}
            label="New password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              if (error) setError(null);
            }}
            error={error}
            disabled={pending}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
