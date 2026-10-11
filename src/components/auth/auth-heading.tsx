export interface AuthHeadingProps {
  title: string;
  description: string;
}

/** Page title + one-line description shown above an auth form. */
export function AuthHeading({ title, description }: AuthHeadingProps) {
  return (
    <div className="space-y-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
      <p className="text-sm text-fg-muted">{description}</p>
    </div>
  );
}
