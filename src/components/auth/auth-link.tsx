import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type AuthLinkProps = ComponentProps<typeof Link>;

/** Inline text link used under the auth forms ("Create one", "Sign in"). */
export function AuthLink({ className, ...props }: AuthLinkProps) {
  return (
    <Link
      className={cn(
        "rounded-sm font-medium text-fg underline-offset-4 outline-none transition-colors duration-150",
        "hover:text-accent hover:underline",
        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        className,
      )}
      {...props}
    />
  );
}
