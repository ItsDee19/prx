import { cn, initials } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, string> = {
  xs: "size-5 text-[10px]",
  sm: "size-6 text-[11px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
};

/** Relative luminance of a #rgb / #rrggbb colour; null for anything else. */
function luminance(hex: string): number | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((d) => d + d).join("") : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(digits.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Near-black initials on light avatar colours, white on dark ones (whichever contrasts more). */
function initialsOnDark(color: string): boolean {
  const l = luminance(color);
  if (l === null) return true;
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / 0.0557; // #111114
  return onWhite >= onInk;
}

export interface UserAvatarProps {
  user: { name: string; color: string };
  size?: AvatarSize;
  className?: string;
}

/**
 * Initials on the user colour, with a soft top highlight and a hairline edge
 * so light colours hold their shape on light surfaces. Announced as an image
 * named after the user.
 */
export function UserAvatar({ user, size = "md", className }: UserAvatarProps) {
  return (
    <span
      role="img"
      aria-label={user.name}
      title={user.name}
      style={{ backgroundColor: user.color }}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold leading-none tracking-tight",
        initialsOnDark(user.color) ? "text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.18)]" : "text-[#111114]",
        "bg-[image:linear-gradient(180deg,rgb(255_255_255/0.22),rgb(255_255_255/0)_60%)]",
        "shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]",
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
      <span className={cn("text-xs text-fg-muted", className)} aria-label="No members">
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
              "inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-medium tabular-nums text-fg-muted ring-2 ring-surface",
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
