import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Plus } from "lucide-react";

import { deleteClientAction, updateClientAction } from "@/app/actions/clients";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { InvoicesTable } from "@/components/invoices/invoices-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClient, getInvoicesForClient } from "@/lib/data";

export async function generateMetadata(props: PageProps<"/clients/[id]">) {
  const { id } = await props.params;
  const client = await getClient(id);
  return { title: client?.company_name ?? "Client" };
}

export default async function ClientDetailPage(
  props: PageProps<"/clients/[id]">,
) {
  const { id } = await props.params;
  const client = await getClient(id);
  if (!client) notFound();

  const invoices = await getInvoicesForClient(id);
  const updateAction = updateClientAction.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/clients">
          <ArrowLeft />
          Back to clients
        </Link>
      </Button>

      <PageHeader title={client.company_name} description={client.email ?? undefined}>
        <Button asChild variant="outline">
          <Link href={`/invoices/new?client=${client.id}`}>
            <Plus />
            New invoice
          </Link>
        </Button>
        <ConfirmDeleteDialog
          action={deleteClientAction}
          id={client.id}
          title="Delete client?"
          description="Deleting this client will unlink it from existing invoices. This cannot be undone."
          triggerLabel="Delete"
        />
      </PageHeader>

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-sm font-medium">Details</h2>
          <ClientForm
            action={updateAction}
            client={client}
            submitLabel="Save changes"
          />
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No invoices for this client"
                  action={
                    <Button asChild>
                      <Link href={`/invoices/new?client=${client.id}`}>
                        <Plus />
                        New invoice
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <InvoicesTable invoices={invoices} showClient={false} />
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
