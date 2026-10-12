import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SettingsSectionProps {
  /** The section's id (in-page links target it); the heading gets `${id}-heading` and labels the section. */
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * One settings group. Stacked (heading above its card) below xl; from xl the
 * heading and description sit in a fixed 16rem column beside the card, which
 * keeps form lines short and uses the width of large screens. (At lg the main
 * column is only ~700px, too narrow to give the form a comfortable width
 * beside a heading column.)
 */
export function SettingsSection({ id, title, description, children, className }: SettingsSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "grid grid-cols-1 gap-3 xl:grid-cols-[16rem_minmax(0,1fr)] xl:gap-10",
        className,
      )}
    >
      <div className="min-w-0 xl:pt-5">
        <h2 id={headingId} className="text-base font-semibold leading-6 text-fg">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-fg-muted text-pretty">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
