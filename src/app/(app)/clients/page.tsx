import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus, SearchX } from "lucide-react";
import { ClientCard } from "@/components/clients/client-card";
import { ClientDialog } from "@/components/clients/client-dialog";
import { ClientsToolbar } from "@/components/clients/clients-toolbar";
import { Stagger, StaggerItem } from "@/components/motion";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { listClientIndustries, listClients } from "@/lib/data/clients";
import { CLIENT_REGIONS, type ClientRegion } from "@/lib/types";
import { pluralize } from "@/lib/utils";

export const metadata: Metadata = { title: "Clients" };

type RawSearchParams = Record<string, string | string[] | undefined>;

interface ClientsPageProps {
  searchParams: Promise<RawSearchParams>;
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function isRegion(value: string): value is ClientRegion {
  return (CLIENT_REGIONS as readonly string[]).includes(value);
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const raw = await searchParams;
  const q = first(raw.q).slice(0, 100);
  const industry = first(raw.industry).slice(0, 60) || null;
  const regionParam = first(raw.region);
  const region = isRegion(regionParam) ? regionParam : null;
  const archived = first(raw.archived) === "1";

  // Commercial roll-ups load for admins only (members get `commercial: null`).
  const [clients, industries] = await Promise.all([
    listClients({ search: q || undefined, industry: industry ?? undefined, region: region ?? undefined, includeArchived: archived }, { includeCommercial: isAdmin }),
    listClientIndustries(),
  ]);
  const filtered = Boolean(q || industry || region);
  const active = clients.reduce((sum, client) => sum + client.active_project_count, 0);

  const newClientTrigger = (
    <Button>
      <Plus aria-hidden />
      New client
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Clients"
        description={
          filtered
            ? `${pluralize(clients.length, "client")} match your filters`
            : `${pluralize(clients.length, "client")} · ${pluralize(active, "active engagement")}`
        }
        actions={<ClientDialog mode="create" trigger={newClientTrigger} />}
      />

      <ClientsToolbar q={q} industry={industry} region={region} archived={archived} industries={industries} />

      {clients.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No clients match."
            description="Try a different search or clear the filters."
            action={
              <Link href={archived ? "/clients?archived=1" : "/clients"} className={buttonVariants({ variant: "outline" })}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={Building2}
            title="No clients yet."
            description="Add the companies you deliver for, then link their engagements."
            action={<ClientDialog mode="create" trigger={newClientTrigger} />}
          />
        )
      ) : (
        <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 3xl:grid-cols-4">
          {clients.map((client) => (
            <StaggerItem key={client.id} className="min-w-0">
              <ClientCard client={client} isAdmin={isAdmin} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
