import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createInvoiceAction } from "@/app/actions/invoices";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getClients, getCompanySettings } from "@/lib/data";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage(
  props: PageProps<"/invoices/new">,
) {
  const { client } = await props.searchParams;
  const [clients, settings] = await Promise.all([
    getClients(),
    getCompanySettings(),
  ]);

  const defaultClientName =
    typeof client === "string"
      ? (clients.find((c) => c.id === client)?.company_name ?? "")
      : "";

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/invoices">
          <ArrowLeft />
          Back to invoices
        </Link>
      </Button>
      <PageHeader
        title="New invoice"
        description="A unique invoice number is assigned automatically on save."
      />
      <InvoiceForm
        action={createInvoiceAction}
        clients={clients}
        defaultClientName={defaultClientName}
        defaultTaxRate={settings?.tax_rate ?? 0}
        submitLabel="Create invoice"
      />
    </div>
  );
}
