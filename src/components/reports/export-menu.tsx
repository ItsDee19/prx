"use client";

import { ChevronDown, Clock, Download, FolderKanban, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildQueryString } from "@/lib/utils";

export interface ExportMenuProps {
  from: string;
  to: string;
  clientId: string | null;
}

/**
 * CSV downloads from the export route handlers (each checks the session;
 * commercial columns are added for admins only, on the server).
 */
export function ExportMenu({ from, to, clientId }: ExportMenuProps) {
  const client = buildQueryString({ client: clientId });
  const time = buildQueryString({ from, to, client: clientId });
  const items = [
    { href: `/api/export/projects${client}`, label: "Projects", icon: FolderKanban },
    { href: `/api/export/tasks${client}`, label: "Tasks", icon: ListChecks },
    { href: `/api/export/time${time}`, label: "Time entries in range", icon: Clock },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download aria-hidden />
          Export CSV
          <ChevronDown aria-hidden className="text-fg-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Download as CSV</DropdownMenuLabel>
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <a href={item.href} download>
              <item.icon aria-hidden />
              {item.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
