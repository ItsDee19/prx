"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { setGoLiveDateAction } from "@/actions/golive";
import { MAX_TUNING_DAYS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { isDateOnly, tuningEndDate } from "@/lib/workspace-time";

export interface SetGoLiveDialogProps {
  projectId: string;
  /** The current go-live date (edit mode), or null before go-live. */
  goLiveDate: string | null;
  tuningDays: number;
  /** Workspace today (default date). */
  today: string;
  /** Element that opens the dialog (rendered with asChild). */
  trigger: ReactNode;
}

/**
 * "Set go-live date": the date (default today) and the tuning window length,
 * with a live preview of when tuning ends. Saving moves the project to
 * Production, completes the Go-live milestone and starts the Scale phase.
 * In edit mode it can also clear the date (Production goes back to Pilot).
 */
export function SetGoLiveDialog({ projectId, goLiveDate, tuningDays, today, trigger }: SetGoLiveDialogProps) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(goLiveDate ?? today);
  const [days, setDays] = useState(String(tuningDays));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setDate(goLiveDate ?? today);
      setDays(String(tuningDays));
      setErrors({});
      setConfirmClear(false);
    }
  }

  const parsedDays = /^\d+$/.test(days.trim()) ? Number(days.trim()) : Number.NaN;
  const end = isDateOnly(date) && Number.isInteger(parsedDays) ? tuningEndDate(date, parsedDays) : null;

  async function save(nextDate: string | null) {
    setPending(true);
    try {
      const result = await setGoLiveDateAction(
        projectId,
        nextDate,
        nextDate === null || parsedDays === tuningDays ? undefined : parsedDays,
      );
      if (!result.ok) {
        if (result.fieldErrors) {
          setErrors({
            date: result.fieldErrors.date ?? "",
            days: result.fieldErrors.tuningDays ?? "",
          });
        }
        toast.error(result.error);
        return;
      }
      toast.success(nextDate === null ? "Go-live date cleared." : `Go-live set to ${formatDate(nextDate)}.`);
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Could not save the go-live date. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!isDateOnly(date)) found.date = "Pick the go-live date";
    if (!Number.isInteger(parsedDays) || parsedDays < 0 || parsedDays > MAX_TUNING_DAYS) {
      found.days = `Use 0 to ${MAX_TUNING_DAYS} days`;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void save(date);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        size="sm"
        title={goLiveDate ? "Edit go-live date" : "Set go-live date"}
        description="Starts the post-go-live tuning countdown and moves the project to Production."
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <FormField label="Go-live date" htmlFor={`${uid}-date`} error={errors.date || undefined} required>
            <Input
              id={`${uid}-date`}
              type="date"
              value={date}
              invalid={Boolean(errors.date)}
              aria-describedby={errors.date ? `${uid}-date-error` : undefined}
              onChange={(event) => setDate(event.target.value)}
            />
          </FormField>
          <FormField
            label="Tuning window"
            htmlFor={`${uid}-days`}
            error={errors.days || undefined}
            hint="Days of post-deploy tuning before handover."
          >
            <div className="relative">
              <Input
                id={`${uid}-days`}
                inputMode="numeric"
                value={days}
                invalid={Boolean(errors.days)}
                aria-describedby={errors.days ? `${uid}-days-error` : `${uid}-days-hint`}
                onChange={(event) => setDays(event.target.value)}
                className="pr-14 tabular-nums"
              />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-fg-muted">
                days
              </span>
            </div>
          </FormField>
          <p className="flex items-center gap-2 rounded-xl bg-surface-2/70 px-3 py-2.5 text-sm text-fg" aria-live="polite">
            <CalendarClock className="size-4 shrink-0 text-accent" aria-hidden />
            {end ? (
              <span>
                Tuning ends <span className="font-medium tabular-nums">{formatDate(end)}</span>.
              </span>
            ) : (
              <span className="text-fg-muted">Pick a date to see when tuning ends.</span>
            )}
          </p>

          {confirmClear ? (
            <DialogFooter className="sm:justify-between">
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="outline" disabled={pending} onClick={() => setConfirmClear(false)}>
                  Keep date
                </Button>
                <Button variant="danger" loading={pending} onClick={() => void save(null)}>
                  Clear date
                </Button>
              </div>
              <p role="status" className="text-sm text-fg sm:order-first sm:mr-auto">
                Clear the go-live date? Production goes back to Pilot.
              </p>
            </DialogFooter>
          ) : (
            <DialogFooter>
              {goLiveDate ? (
                <Button variant="ghost" className="text-danger sm:mr-auto" disabled={pending} onClick={() => setConfirmClear(true)}>
                  Clear date
                </Button>
              ) : null}
              <DialogClose asChild>
                <Button variant="outline" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending}>
                <Rocket aria-hidden />
                {goLiveDate ? "Save" : "Set go-live"}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
