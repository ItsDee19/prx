import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FormErrorProps {
  message?: string | null;
  className?: string;
}

/** Top-level error banner for auth forms. Renders nothing when there is no message. */
export function FormError({ message, className }: FormErrorProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "reveal-fade flex items-start gap-2.5 rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger",
        className,
      )}
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 leading-5 [overflow-wrap:anywhere]">{message}</p>
    </div>
  );
}
