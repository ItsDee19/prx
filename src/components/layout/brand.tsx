import Link from "next/link";
import { APP_NAME, COMPANY_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface BrandProps {
  /** Wrap the wordmark in a link (e.g. to the dashboard). */
  href?: string;
  size?: "sm" | "md";
  /** Show the company caption under the product name. */
  showCaption?: boolean;
  className?: string;
  onClick?: () => void;
}

/** PRX wordmark: accent tile with a "P" plus the name and the AvlysAI caption. */
export function Brand({ href, size = "md", showCaption = true, className, onClick }: BrandProps) {
  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-accent font-bold leading-none text-accent-fg",
          size === "sm" ? "size-6 text-[13px]" : "size-7 text-sm",
        )}
      >
        P
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className={cn("font-semibold tracking-tight text-fg", size === "sm" ? "text-sm" : "text-[15px]")}>
          {APP_NAME}
        </span>
        {showCaption ? (
          <span className="mt-0.5 truncate text-[11px] font-medium text-fg-muted">{COMPANY_NAME}</span>
        ) : null}
      </span>
    </>
  );

  const classes = cn("inline-flex items-center gap-2.5", className);

  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        aria-label={`${APP_NAME} home`}
        className={cn(
          classes,
          "rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        )}
      >
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}
