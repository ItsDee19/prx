import Link from "next/link";
import { TextShine } from "@/components/motion/text-shine";
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

/**
 * The PRX logo mark: a brand-gradient tile with a glass highlight and the
 * "P" monogram. Decorative; the wordmark next to it carries the name.
 */
export function BrandMark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-grad-brand font-bold leading-none text-white",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_2px_8px_-2px_rgb(0_113_227/0.5)]",
        "before:absolute before:inset-x-0 before:top-0 before:h-1/2 before:bg-white/15",
        size === "sm" && "size-6 rounded-[7px] text-[13px]",
        size === "md" && "size-7 rounded-[8px] text-sm",
        size === "lg" && "size-10 rounded-[11px] text-lg",
        className,
      )}
    >
      <span className="relative tracking-tight">P</span>
    </span>
  );
}

/** PRX wordmark: gradient mark, the product name with the AvlysAI text shine, and the company caption. */
export function Brand({ href, size = "md", showCaption = true, className, onClick }: BrandProps) {
  const content = (
    <>
      <BrandMark size={size} />
      <span className="flex min-w-0 flex-col leading-none">
        <TextShine className={cn("font-semibold tracking-[-0.02em]", size === "sm" ? "text-sm" : "text-[15px]")}>
          {APP_NAME}
        </TextShine>
        {showCaption ? (
          <span className="mt-1 truncate text-[11px] font-medium text-fg-muted">{COMPANY_NAME}</span>
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
          "rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        )}
      >
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}
