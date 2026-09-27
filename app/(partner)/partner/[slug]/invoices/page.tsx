import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { JobInvoiceList } from "@/components/partner-jobs/job-invoice-list";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { summarizePayments } from "@/lib/invoice";
import {
  getPartnerCompanyBySlug,
  partnerBasePath,
  partnerHref,
  requirePartnerSession,
} from "@/lib/partner-jobs/context";
import { getPartnerJobLabels } from "@/lib/partner-jobs/queries";
import { getJobLinkedInvoices } from "@/lib/queries/invoices";

export const metadata = { title: "Invoices" };

/**
 * Every invoice on the company's jobs, with what is still owed.
 *
 * Read-only by construction: the studio records deposits and payments, and a
 * trigger refuses any write to the invoicing tables from a partner session
 * (migration 20260926120000). RLS is the whole filter — only non-draft
 * invoices linked to this company's own jobs come back.
 */
export default async function PartnerInvoicesPage({
  params,
}: PageProps<"/partner/[slug]/invoices">) {
  const { slug } = await params;
  await requirePartnerSession(slug, "/invoices");
  const company = await getPartnerCompanyBySlug(slug);
  if (!company?.invoices_enabled) notFound();
  const basePath = await partnerBasePath(slug);

  const invoices = await getJobLinkedInvoices();
  const jobs = await getPartnerJobLabels(
    [...new Set(invoices.map((invoice) => invoice.design_job_id).filter(Boolean))] as string[],
  );
  const jobLabels = new Map([...jobs].map(([id, job]) => [id, job.job_number]));

  let invoiced = 0;
  let paid = 0;
  for (const invoice of invoices) {
    invoiced += Number(invoice.total);
    paid += summarizePayments(invoice.total, invoice.payments).paid;
  }
  const outstanding = invoiced - paid;

  return (
    <>
      <PageHeader
        title="Invoices"
        description="What's been billed on your jobs, what's been paid, and what's still due."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Balance due", outstanding],
          ["Total invoiced", invoiced],
          ["Total paid", paid],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent>
              <p className="text-muted-foreground text-sm md:text-xs">{label}</p>
              <p className="mt-1 text-2xl tabular-nums md:text-xl">
                {formatCurrency(value as number)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <JobInvoiceList
        invoices={invoices}
        invoiceHref={partnerHref(basePath, "/invoices")}
        jobLabels={jobLabels}
        emptyNote="No invoices yet. They'll show up here once TD Studios bills a job."
      />
    </>
  );
}
