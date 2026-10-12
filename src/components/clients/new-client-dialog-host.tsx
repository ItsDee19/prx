"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeAppCommands } from "@/lib/utils";
import { ClientDialog } from "./client-dialog";

/**
 * Mounted once in the app shell (GlobalOverlays). Opens the client dialog for
 * the `new-client` AppCommand (command palette) and goes to the new client.
 */
export function NewClientDialogHost() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      subscribeAppCommands((command) => {
        if (command.type === "new-client") setOpen(true);
      }),
    [],
  );

  return (
    <ClientDialog mode="create" open={open} onOpenChange={setOpen} onSuccess={(id) => router.push(`/clients/${id}`)} />
  );
}
