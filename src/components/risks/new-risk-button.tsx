"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageReady } from "@/hooks/use-page-ready";
import { RISK_KIND_CONFIG } from "@/lib/constants";
import type { RiskKind, UserSummary } from "@/lib/types";
import { RiskDialog } from "./risk-dialog";

export interface NewRiskButtonProps {
  projectId: string;
  users: UserSummary[];
  /** The open kind tab, used as the default type. */
  defaultKind?: RiskKind | null;
  /** `?new=1`: open the dialog on arrival (then the flag is removed from the URL). */
  autoOpen?: boolean;
  label?: string;
  variant?: "primary" | "outline";
}

/** "Add" button for the RAID log; also handles the `?tab=risks&new=1` deep link. */
export function NewRiskButton({
  projectId,
  users,
  defaultKind = null,
  autoOpen = false,
  label,
  variant = "primary",
}: NewRiskButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const handled = useRef(false);
  // `?new=` opens the dialog only after the first page load has hydrated (a modal
  // marks the rest of the page aria-hidden, which must not race hydration).
  const pageReady = usePageReady();
  const kind = defaultKind ?? "risk";

  useEffect(() => {
    if (!autoOpen || !pageReady || handled.current) return;
    handled.current = true;
    setOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has("new")) return;
    params.delete("new");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [autoOpen, pageReady, pathname, router, searchParams]);

  return (
    <RiskDialog
      mode="create"
      projectId={projectId}
      users={users}
      defaultKind={kind}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant={variant}>
          <Plus aria-hidden />
          {label ?? `Add ${defaultKind ? RISK_KIND_CONFIG[defaultKind].label.toLowerCase() : "item"}`}
        </Button>
      }
    />
  );
}
