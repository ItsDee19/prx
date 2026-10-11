import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SpinnerProps {
  className?: string;
  size?: "sm" | "md";
  /** When given, the spinner becomes a live region announcing this text. */
  label?: string;
}

export function Spinner({ className, size = "md", label }: SpinnerProps) {
  const icon = (
    <LoaderCircle
      aria-hidden
      className={cn("animate-spin motion-reduce:animate-none", size === "sm" ? "size-3.5" : "size-4")}
    />
  );
  if (!label) {
    return (
      <span aria-hidden className={cn("inline-flex shrink-0", className)}>
        {icon}
      </span>
    );
  }
  return (
    <span role="status" className={cn("inline-flex shrink-0 items-center", className)}>
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
