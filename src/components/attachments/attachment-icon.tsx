"use client";

import { useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { LINK_TYPE_CONFIG } from "@/lib/constants";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { faviconUrl, fileTypeInfo } from "./attachment-utils";

export interface AttachmentIconProps {
  attachment: Pick<Attachment, "kind" | "url" | "link_type" | "mime_type" | "name">;
  /** Tile size: sm 28px (drawer, pills), md 36px (rows), lg 48px (grid tiles). */
  size?: "sm" | "md" | "lg";
  /** Request the linked site's favicon (off for confidential clients). */
  favicon?: boolean;
  className?: string;
}

const BOX: Record<NonNullable<AttachmentIconProps["size"]>, string> = {
  sm: "size-7 rounded-lg [&_svg]:size-3.5",
  md: "size-9 rounded-[10px] [&_svg]:size-4",
  lg: "size-12 rounded-xl [&_svg]:size-5",
};

const FAVICON_PX: Record<NonNullable<AttachmentIconProps["size"]>, number> = { sm: 14, md: 18, lg: 22 };

/**
 * Decorative icon tile for an attachment: the site's favicon for links (with
 * the link-type icon as the fallback), a type icon for files.
 */
export function AttachmentIcon({ attachment, size = "md", favicon = true, className }: AttachmentIconProps) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const box = cn(
    "relative flex shrink-0 items-center justify-center border border-border bg-surface-2 text-fg-muted",
    BOX[size],
    className,
  );

  if (attachment.kind === "file") {
    const { icon: FileTypeIcon } = fileTypeInfo(attachment.mime_type, attachment.name);
    return (
      <span aria-hidden className={cn(box, "text-accent")}>
        <FileTypeIcon />
      </span>
    );
  }

  const type = attachment.link_type ?? "other";
  const src = favicon && !faviconFailed ? faviconUrl(attachment.url) : null;
  return (
    <span aria-hidden className={box}>
      {src ? (
        <Image
          src={src}
          alt=""
          width={FAVICON_PX[size]}
          height={FAVICON_PX[size]}
          unoptimized
          loading="lazy"
          referrerPolicy="no-referrer"
          className="rounded-[3px] object-contain"
          onError={() => setFaviconFailed(true)}
        />
      ) : (
        <Icon name={LINK_TYPE_CONFIG[type].icon} />
      )}
    </span>
  );
}
