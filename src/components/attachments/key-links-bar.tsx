"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus } from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { LINK_TYPE_CONFIG } from "@/lib/constants";
import type { Attachment, LinkType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AttachmentIcon } from "./attachment-icon";
import { hostOf } from "./attachment-utils";
import { LinkForm } from "./link-form";

export interface KeyLinksBarProps {
  projectId: string;
  links: Attachment[];
  /** Request favicons (off for confidential clients). */
  favicons: boolean;
  /** The Files tab, for managing links. */
  filesHref: string;
}

/**
 * Pinned project links as pill buttons (type icon or favicon + type label;
 * the name is added when a type repeats), plus an "Add link" popover that
 * pins the new link.
 */
export function KeyLinksBar({ projectId, links, favicons, filesHref }: KeyLinksBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const typeCounts = new Map<LinkType, number>();
  for (const link of links) {
    const type = link.link_type ?? "other";
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
  }

  const addButton = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={links.length === 0 ? "outline" : "ghost"} size="sm" className="rounded-full">
          <Plus aria-hidden />
          Add link
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="mb-3 text-sm font-semibold text-fg">Add a key link</p>
        <LinkForm
          projectId={projectId}
          compact
          allowPin={false}
          defaultPinned
          submitLabel="Pin link"
          onCancel={() => setOpen(false)}
          onAdded={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </PopoverContent>
    </Popover>
  );

  if (links.length === 0) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-muted">Pin the repo, staging, live and design links so everyone finds them in one click.</p>
        <div className="shrink-0">{addButton}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Stagger as="ul" className="flex min-w-0 flex-wrap items-center gap-2">
        {links.map((link) => {
          const type = link.link_type ?? "other";
          const config = LINK_TYPE_CONFIG[type];
          const repeated = (typeCounts.get(type) ?? 0) > 1;
          const host = hostOf(link.url);
          return (
            <StaggerItem as="li" key={link.id} className="min-w-0">
              <Tooltip content={host ? `${link.name} · ${host}` : link.name}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group/pill inline-flex h-9 max-w-[16rem] items-center gap-2 rounded-full border border-border bg-surface-2/60 pl-1 pr-3.5 text-sm font-medium text-fg",
                    "transition-control hover:-translate-y-px hover:border-accent/40 hover:bg-accent-soft hover:text-accent-soft-fg active:translate-y-0 active:scale-[0.97]",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg motion-reduce:hover:translate-y-0",
                  )}
                >
                  <AttachmentIcon attachment={link} size="sm" favicon={favicons} className="rounded-full" />
                  <span className="truncate">
                    {repeated ? (
                      <>
                        {config.label}
                        <span className="text-fg-muted group-hover/pill:text-accent-soft-fg"> · {link.name}</span>
                      </>
                    ) : (
                      config.label
                    )}
                  </span>
                  <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-fg-subtle transition-transform duration-(--dur-2) group-hover/pill:translate-x-px group-hover/pill:-translate-y-px" />
                  <span className="sr-only">
                    {repeated ? "" : `: ${link.name}`} (opens in a new tab)
                  </span>
                </a>
              </Tooltip>
            </StaggerItem>
          );
        })}
      </Stagger>
      {addButton}
      <Link
        href={filesHref}
        className="ml-auto rounded-md text-xs font-medium text-fg-muted outline-none hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Manage
      </Link>
    </div>
  );
}
