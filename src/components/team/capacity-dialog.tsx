"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setUserCapacityAction, setUserCostRateAction } from "@/actions/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { MAX_WEEKLY_CAPACITY_HOURS } from "@/lib/constants";
import type { User } from "@/lib/types";

export interface CapacityDialogProps {
  user: User;
  /** ADMIN-ONLY current cost rate (INR per hour); the dialog is only rendered for admins. */
  costRate: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Admin dialog: weekly capacity (hours) used for workload and the Team
 * page's "This week" column, and the internal cost rate (INR per hour) used
 * for approximate margins. The cost rate is never shown to members.
 */
export function CapacityDialog({ user, costRate, open, onOpenChange }: CapacityDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title={`Capacity and cost for ${user.name}`}
        description="Capacity drives workload and the This week column. The cost rate is admin-only and feeds approximate margins."
      >
        {open ? <CapacityForm user={user} costRate={costRate} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CapacityForm({ user, costRate, onDone }: { user: User; costRate: number | null; onDone: () => void }) {
  const router = useRouter();
  const id = useId();
  const [capacity, setCapacity] = useState(String(user.weekly_capacity_hours));
  const [rate, setRate] = useState(costRate === null ? "" : String(costRate));
  const [errors, setErrors] = useState<{ capacity?: string; rate?: string }>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: { capacity?: string; rate?: string } = {};
    const hours = Number(capacity.trim());
    if (!capacity.trim() || !Number.isInteger(hours) || hours < 0 || hours > MAX_WEEKLY_CAPACITY_HOURS) {
      nextErrors.capacity = `Enter whole hours from 0 to ${MAX_WEEKLY_CAPACITY_HOURS}`;
    }
    const rateText = rate.trim().replace(/[₹,\s]/g, "");
    const rateValue = rateText === "" ? null : Number(rateText);
    if (rateValue !== null && (!Number.isInteger(rateValue) || rateValue < 0)) {
      nextErrors.rate = "Enter whole rupees per hour, or leave empty";
    }
    setErrors(nextErrors);
    if (nextErrors.capacity || nextErrors.rate) return;

    setPending(true);
    try {
      const results = await Promise.all([
        hours !== user.weekly_capacity_hours ? setUserCapacityAction(user.id, hours) : Promise.resolve(null),
        rateValue !== costRate ? setUserCostRateAction(user.id, rateValue) : Promise.resolve(null),
      ]);
      const failed = results.find((result) => result !== null && !result.ok);
      if (failed && !failed.ok) {
        toast.error(failed.error);
        return;
      }
      toast.success(`Saved ${user.name}'s capacity and cost rate.`);
      router.refresh();
      onDone();
    } catch {
      toast.error("Could not save. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormField label="Weekly capacity (hours)" htmlFor={`${id}-capacity`} error={errors.capacity} required>
        <Input
          id={`${id}-capacity`}
          inputMode="numeric"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          invalid={Boolean(errors.capacity)}
          className="font-mono tabular-nums"
          autoFocus
        />
      </FormField>
      <FormField
        label="Cost rate (INR per hour)"
        htmlFor={`${id}-rate`}
        error={errors.rate}
        hint="Admin-only. Leave empty when unknown; their hours then count as zero cost."
      >
        <Input
          id={`${id}-rate`}
          inputMode="numeric"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          placeholder="Amount per hour"
          invalid={Boolean(errors.rate)}
          className="font-mono tabular-nums"
          aria-describedby={errors.rate ? `${id}-rate-error` : `${id}-rate-hint`}
        />
      </FormField>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" loading={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
