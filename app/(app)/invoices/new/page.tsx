import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createInvoiceAction } from "@/app/actions/invoices";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { getPartnerJobInvoiceContext } from "@/lib/partner-jobs/queries";
import { getClients } from "@/lib/queries/clients";
import { getCompanySettings } from "@/lib/queries/settings";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage(
  props: PageProps<"/invoices/new">,
) {
  const { client, job } = await props.searchParams;
  const [clients, settings] = await Promise.all([
    getClients(),
    getCompanySettings(),
  ]);

  // ?job=<id> starts an invoice for a partner job (from /partner-jobs/[jobId]).
  // Reading the job needs the service role, so it is admin-gated first.
  let designJob: { id: string; label: string } | undefined;
  let jobCompanyName: string | undefined;
  if (typeof job === "string" && job) {
    await requireAdmin();
    const context = await getPartnerJobInvoiceContext(job);
    if (!context || !context.company.invoices_enabled) notFound();
    designJob = {
      id: context.job.id,
      label: `${context.job.job_number} — ${context.job.job_name}`,
    };
    jobCompanyName =
      clients.find((c) => c.id === context.company.client_id)?.company_name ??
      context.company.name;
  }

  const defaultClientName =
    jobCompanyName ??
    (typeof client === "string"
      ? (clients.find((c) => c.id === client)?.company_name ?? "")
      : "");

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={designJob ? `/partner-jobs/${designJob.id}` : "/invoices"}>
          <ArrowLeft />
          {designJob ? "Back to job" : "Back to invoices"}
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
        designJob={designJob}
      />
    </div>
  );
}
