"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ChevronsUpDown, LogOut, Settings } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { UserAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ThemeMenuItems } from "./theme-toggle";

const ROLE_LABEL: Record<User["role"], string> = {
  admin: "Admin",
  member: "Member",
};

export interface UserMenuProps {
  user: User;
  /** Avatar-only trigger (used in the mobile top bar). */
  compact?: boolean;
  className?: string;
}

export function UserMenu({ user, compact = false, className }: UserMenuProps) {
  const logoutForm = useRef<HTMLFormElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button
            type="button"
            aria-label="Account menu"
            className={cn(
              "rounded-full outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              className,
            )}
          >
            <UserAvatar user={user} size="md" />
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-150",
              "hover:bg-surface-2 data-[state=open]:bg-surface-2",
              "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              className,
            )}
          >
            <UserAvatar user={user} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium leading-5 text-fg">{user.name}</span>
              <span className="block truncate text-xs leading-4 text-fg-muted">{ROLE_LABEL[user.role]}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            <span className="sr-only">Account menu</span>
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={compact ? "end" : "start"}
        side={compact ? "bottom" : "top"}
        className={compact ? "w-60" : "w-(--radix-dropdown-menu-trigger-width) min-w-56"}
      >
        <DropdownMenuLabel className="py-2">
          <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
          <span className="block truncate text-xs font-normal text-fg-muted">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <ThemeMenuItems />
        <DropdownMenuSeparator />
        {/*
         * The form wraps the item so the menu stays mounted while the server
         * action runs; onSelect submits it for both pointer and keyboard.
         */}
        <form ref={logoutForm} action={logoutAction}>
          <LogoutItem onSubmitRequest={() => logoutForm.current?.requestSubmit()} />
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LogoutItem({ onSubmitRequest }: { onSubmitRequest: () => void }) {
  const { pending } = useFormStatus();
  return (
    <DropdownMenuItem
      destructive
      disabled={pending}
      onSelect={(event) => {
        event.preventDefault();
        onSubmitRequest();
      }}
    >
      {pending ? <Spinner size="md" /> : <LogOut aria-hidden />}
      {pending ? "Logging out…" : "Log out"}
    </DropdownMenuItem>
  );
}
