"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Handshake, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { closeTuningAction } from "@/actions/golive";

export interface CloseTuningDialogProps {
  projectId: string;
  handoverDone: number;
  handoverTotal: number;
  /** Days until the tuning window ends (negative when past), null before go-live. */
  daysLeft: number | null;
}

/**
 * "Close tuning": hands the project over. While handover items are open (or
 * the window has days left) the user must explicitly confirm closing early.
 */
export function CloseTuningDialog({ projectId, handoverDone, handoverTotal, daysLeft }: CloseTuningDialogProps) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [early, setEarly] = useState(false);
  const [pending, setPending] = useState(false);
  const openItems = Math.max(0, handoverTotal - handoverDone);
  const daysRemaining = daysLeft !== null && daysLeft > 0 ? daysLeft : 0;
  const needsEarly = openItems > 0 || daysRemaining > 0;

  async function confirm() {
    setPending(true);
    try {
      const result = await closeTuningAction(projectId, { early: needsEarly });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Tuning closed. The project is handed over.");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Could not close tuning. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) setEarly(false);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={needsEarly ? "outline" : "primary"} size="sm">
          <Handshake aria-hidden />
          Close tuning
        </Button>
      </DialogTrigger>
      <DialogContent
        size="sm"
        title="Close tuning and hand over?"
        description="The delivery state becomes Handed over and the tuning countdown stops."
      >
        <div className="space-y-4">
          {needsEarly ? (
            <div className="space-y-3 rounded-xl bg-warning/10 px-3 py-3 ring-1 ring-inset ring-warning/30">
              <p className="flex items-start gap-2 text-sm text-fg">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  {openItems > 0
                    ? `${openItems} of ${handoverTotal} handover ${handoverTotal === 1 ? "item is" : "items are"} still open.`
                    : "Every handover item is done."}
                  {daysRemaining > 0 ? ` The window has ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} left.` : ""}
                </span>
              </p>
              <label htmlFor={`${uid}-early`} className="flex cursor-pointer items-start gap-2.5 text-sm text-fg">
                <Checkbox
                  id={`${uid}-early`}
                  checked={early}
                  onChange={(event) => setEarly(event.target.checked)}
                  className="mt-0.5"
                />
                <span>I am closing tuning early.</span>
              </label>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">
              {handoverTotal > 0 ? "Every handover item is done." : "This project has no handover checklist."}
            </p>
          )}
          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button loading={pending} disabled={needsEarly && !early} onClick={() => void confirm()}>
              {needsEarly ? "Close early" : "Close tuning"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
