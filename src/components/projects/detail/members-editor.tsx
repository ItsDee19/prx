"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { AvatarStack, UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setProjectMembersAction } from "@/actions/projects";
import type { UserSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MembersEditorProps {
  projectId: string;
  members: UserSummary[];
  users: UserSummary[];
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

/** Avatar stack of the current members plus a "Manage" popover with a checkbox list of all users. */
export function MembersEditor({ projectId, members, users }: MembersEditorProps) {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(members.map((m) => m.id)),
  );

  const current = new Set(members.map((m) => m.id));
  const dirty = !sameSet(selected, current);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    // Start every session from what is saved so abandoned edits do not linger.
    if (next) setSelected(new Set(members.map((m) => m.id)));
    setOpen(next);
  }

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save() {
    setPending(true);
    try {
      const result = await setProjectMembersAction(projectId, Array.from(selected));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.length === 0
          ? "Members cleared"
          : `Members updated (${result.data.length})`,
      );
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Could not update the members. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      {members.length > 0 ? (
        <AvatarStack users={members} max={5} />
      ) : (
        <span className="text-sm text-fg-subtle">No members</span>
      )}
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" aria-label="Manage members">
            <Users aria-hidden />
            Manage
          </Button>
        </PopoverTrigger>
        {/* Fits a 320px phone (collision padding keeps 8px each side) and never grows taller than
            the space Radix measured below/above the trigger: the user list scrolls instead. */}
        <PopoverContent
          align="end"
          className="flex max-h-(--radix-popover-content-available-height) w-72 max-w-[calc(100vw-1rem)] flex-col p-0"
        >
          <div className="shrink-0 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-fg" id={`${listId}-title`}>
              Members
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {selected.size === 0 ? "Nobody selected" : `${selected.size} of ${users.length} selected`}
            </p>
          </div>
          {users.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-fg-muted">No active users to add.</p>
          ) : (
            <ul
              aria-labelledby={`${listId}-title`}
              className="max-h-64 min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
            >
              {users.map((user) => {
                const inputId = `${listId}-${user.id}`;
                const checked = selected.has(user.id);
                return (
                  <li key={user.id}>
                    <label
                      htmlFor={inputId}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-150",
                        "pointer-coarse:py-2.5",
                        "hover:bg-surface-2",
                        checked && "bg-accent-soft/60 hover:bg-accent-soft",
                      )}
                    >
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        disabled={pending}
                        onChange={(event) => toggle(user.id, event.target.checked)}
                      />
                      <UserAvatar user={user} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{user.name}</span>
                        {user.job_title ? (
                          <span className="block truncate text-xs text-fg-muted">{user.job_title}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-2.5">
            <PopoverClose asChild>
              <Button variant="ghost" size="sm" disabled={pending}>
                Cancel
              </Button>
            </PopoverClose>
            <Button size="sm" loading={pending} disabled={!dirty} onClick={save}>
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
