export interface AuthHeadingProps {
  title: string;
  description: string;
}

/** Page title + one-line description shown above an auth form. */
export function AuthHeading({ title, description }: AuthHeadingProps) {
  return (
    <div className="space-y-1.5">
      <h1 className="text-2xl font-semibold leading-[1.875rem] tracking-[-0.02em] text-fg">{title}</h1>
      <p className="text-sm text-fg-muted text-pretty">{description}</p>
    </div>
  );
}
