import Link from "next/link";
import { Mail, Phone, Plus, Users } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getClients } from "@/lib/data";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const clients = await getClients();

  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone you invoice, in one place."
      >
        <Button asChild>
          <Link href="/clients/new">
            <Plus />
            New client
          </Link>
        </Button>
      </PageHeader>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add your first client to start creating invoices."
          action={
            <Button asChild>
              <Link href="/clients/new">
                <Plus />
                New client
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="hover:border-foreground/20 h-full transition-colors">
                <CardContent className="space-y-3 pt-6">
                  <div>
                    <p className="font-medium">{client.company_name}</p>
                    {client.contact_name ? (
                      <p className="text-muted-foreground text-sm">
                        {client.contact_name}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground space-y-1 text-sm">
                    {client.email ? (
                      <p className="flex items-center gap-2">
                        <Mail className="size-3.5 shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </p>
                    ) : null}
                    {client.phone ? (
                      <p className="flex items-center gap-2">
                        <Phone className="size-3.5 shrink-0" />
                        <span className="truncate">{client.phone}</span>
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
