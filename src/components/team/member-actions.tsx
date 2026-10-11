"use client";

import { KeyRound, MoreHorizontal, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { setUserActiveAction, updateUserRoleAction } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import type { User } from "@/lib/types";
import { ResetPasswordDialog } from "./reset-password-dialog";

export interface MemberActionsProps {
  user: User;
  /** The signed-in admin; actions that target yourself are disabled. */
  currentUserId: string;
}

type PendingDialog = "reset" | "status" | null;

/**
 * Admin row menu: change role, reset password, deactivate / reactivate.
 * Dialogs are controlled and rendered outside the menu so they survive the
 * menu closing (the Radix-recommended pattern for menu-triggered dialogs).
 */
export function MemberActions({ user, currentUserId }: MemberActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<PendingDialog>(null);
  const [busy, setBusy] = useState(false);
  const isSelf = user.id === currentUserId;
  const isAdmin = user.role === "admin";

  async function changeRole() {
    const nextRole = isAdmin ? "member" : "admin";
    setBusy(true);
    try {
      const result = await updateUserRoleAction(user.id, nextRole);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${user.name} is now ${nextRole === "admin" ? "an admin" : "a member"}`);
      router.refresh();
    } catch {
      toast.error("Could not change the role. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    const activate = !user.is_active;
    const result = await setUserActiveAction(user.id, activate);
    if (!result.ok) {
      toast.error(result.error);
      throw new Error(result.error);
    }
    toast.success(activate ? `${user.name} was reactivated` : `${user.name} was deactivated`);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${user.name}`}
            loading={busy}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <SelfGuardedItem
            isSelf={isSelf}
            reason="You cannot change your own role."
            onSelect={changeRole}
          >
            {isAdmin ? <ShieldOff aria-hidden /> : <ShieldCheck aria-hidden />}
            {isAdmin ? "Make member" : "Make admin"}
          </SelfGuardedItem>
          <SelfGuardedItem
            isSelf={isSelf}
            reason="Change your own password in Settings."
            onSelect={() => setDialog("reset")}
          >
            <KeyRound aria-hidden />
            Reset password
          </SelfGuardedItem>
          <DropdownMenuSeparator />
          <SelfGuardedItem
            isSelf={isSelf}
            reason="You cannot deactivate your own account."
            onSelect={() => setDialog("status")}
            destructive={user.is_active}
          >
            {user.is_active ? <UserX aria-hidden /> : <UserCheck aria-hidden />}
            {user.is_active ? "Deactivate" : "Reactivate"}
          </SelfGuardedItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResetPasswordDialog
        user={user}
        open={dialog === "reset"}
        onOpenChange={(open) => setDialog(open ? "reset" : null)}
      />

      <ActiveStatusDialog
        user={user}
        open={dialog === "status"}
        onOpenChange={(open) => setDialog(open ? "status" : null)}
        onConfirm={toggleActive}
      />
    </>
  );
}

/* ---------------------------------------------------------------------- */

interface SelfGuardedItemProps {
  isSelf: boolean;
  /** Tooltip shown when the item targets the signed-in admin. */
  reason: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
}

/**
 * Menu item that is disabled when it would act on yourself. Disabled Radix
 * items ignore pointer events, so the tooltip is attached to a wrapper that
 * still receives hover.
 */
function SelfGuardedItem({ isSelf, reason, onSelect, disabled, destructive, children }: SelfGuardedItemProps) {
  const item = (
    <DropdownMenuItem onSelect={onSelect} disabled={isSelf || disabled} destructive={destructive}>
      {children}
      {isSelf ? <span className="sr-only"> (unavailable: {reason})</span> : null}
    </DropdownMenuItem>
  );
  if (!isSelf) return item;
  return (
    <Tooltip content={reason} side="left">
      <div className="cursor-not-allowed">{item}</div>
    </Tooltip>
  );
}

/* ---------------------------------------------------------------------- */

interface ActiveStatusDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}

/**
 * Confirm deactivate / reactivate. Mirrors <ConfirmDialog> but is controlled,
 * because the trigger lives inside a dropdown menu that unmounts on select.
 */
function ActiveStatusDialog({ user, open, onOpenChange, onConfirm }: ActiveStatusDialogProps) {
  const [pending, setPending] = useState(false);
  const deactivating = user.is_active;

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Error already surfaced via toast; keep the dialog open to retry or cancel.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent
        size="sm"
        title={deactivating ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`}
        description={
          deactivating
            ? "They will be signed out everywhere and will no longer be able to sign in. Their projects, comments and history are kept."
            : "They will be able to sign in again with their existing password."
        }
      >
        <DialogFooter className="mt-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant={deactivating ? "danger" : "primary"} loading={pending} onClick={handleConfirm}>
            {deactivating ? "Deactivate" : "Reactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
