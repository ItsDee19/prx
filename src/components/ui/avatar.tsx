import { cn, initials } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, string> = {
  xs: "size-5 text-[10px]",
  sm: "size-6 text-[11px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
};

export interface UserAvatarProps {
  user: { name: string; color: string };
  size?: AvatarSize;
  className?: string;
}

/** Initials on the user colour. Announced as an image named after the user. */
export function UserAvatar({ user, size = "md", className }: UserAvatarProps) {
  return (
    <span
      role="img"
      aria-label={user.name}
      title={user.name}
      style={{ backgroundColor: user.color }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none text-white",
        "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]",
        SIZES[size],
        className,
      )}
    >
      {initials(user.name)}
    </span>
  );
}

export interface AvatarStackProps {
  users: { id: string; name: string; color: string }[];
  /** Maximum avatars shown before collapsing the rest into "+N". */
  max?: number;
  size?: AvatarSize;
  className?: string;
}

export function AvatarStack({ users, max = 4, size = "sm", className }: AvatarStackProps) {
  if (users.length === 0) {
    return (
      <span className={cn("text-xs text-fg-subtle", className)} aria-label="No members">
        &mdash;
      </span>
    );
  }
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;
  const names = users.map((u) => u.name).join(", ");

  return (
    <Tooltip content={names}>
      <span className={cn("inline-flex items-center -space-x-1.5", className)} role="group" aria-label={names}>
        {visible.map((user) => (
          <UserAvatar key={user.id} user={user} size={size} className="ring-2 ring-surface" />
        ))}
        {overflow > 0 ? (
          <span
            aria-hidden
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-medium text-fg-muted ring-2 ring-surface",
              SIZES[size],
            )}
          >
            +{overflow}
          </span>
        ) : null}
      </span>
    </Tooltip>
  );
}
