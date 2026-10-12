"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getProjectSummaryAction } from "@/actions/projects";
import type { UserSummary } from "@/lib/types";
import { subscribeAppCommands } from "@/lib/utils";
import { NewProjectWithTemplate } from "@/components/templates";

export interface NewProjectDialogHostProps {
  users: UserSummary[];
  /** Workspace today (the template schedule's default start date). */
  today: string;
}

/**
 * Mounted once in the app shell (GlobalOverlays). Opens the template-enabled
 * new-project dialog for the `new-project` AppCommand (palette, Shift+C), as a sub-project when the
 * command carries a `parentId`, and goes to the new project once it exists.
 */
export function NewProjectDialogHost({ users, today }: NewProjectDialogHostProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = subscribeAppCommands((command) => {
      if (command.type !== "new-project") return;
      if (!command.parentId) {
        setParent(null);
        setOpen(true);
        return;
      }
      getProjectSummaryAction(command.parentId).then((result) => {
        if (disposed) return;
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setParent({ id: result.data.id, name: result.data.name });
        setOpen(true);
      });
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return (
    <NewProjectWithTemplate
      users={users}
      today={today}
      parentId={parent?.id ?? null}
      parentName={parent?.name ?? null}
      open={open}
      onOpenChange={setOpen}
      onSuccess={(id) => router.push(`/projects/${id}`)}
    />
  );
}
