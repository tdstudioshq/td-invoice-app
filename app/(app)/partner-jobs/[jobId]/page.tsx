import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Pencil, Plus, Unlink } from "lucide-react";

import {
  deleteStudioJobPaymentAction,
  recordStudioJobPaymentAction,
} from "@/app/actions/admin-partner-job-payments";
import { unlinkInvoiceFromJobAction } from "@/app/actions/partner-job-invoices";
import { AdminLinkInvoiceForm } from "@/components/partner-jobs/admin-link-invoice-form";
import { JobInvoiceList } from "@/components/partner-jobs/job-invoice-list";
import { JobPayments } from "@/components/partner-jobs/job-payments";

import { PageHeader } from "@/components/layout/page-header";
import { DownloadAllFilesButton } from "@/components/partner-jobs/download-all-files-button";
import { JobFileList } from "@/components/partner-jobs/job-file-list";
import { JobProductList } from "@/components/partner-jobs/job-product-list";
import { JobActivity } from "@/components/partner-jobs/job-activity";
import { JobStatusBadge } from "@/components/partner-jobs/job-status-badge";
import { PartnerJobStatusForm } from "@/components/partner-jobs/admin-status-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  getAdminPartnerJob,
  getAdminPartnerJobEvents,
  getAdminPartnerJobPayments,
} from "@/lib/partner-jobs/queries";
import { getInvoicesForClient, getInvoicesForJob } from "@/lib/queries/invoices";

export const metadata = { title: "Partner Job" };

/** One labelled value in the detail cards. Mirrors /mylar-requests/[id]. */
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

export default async function PartnerJobDetailPage(
  props: PageProps<"/partner-jobs/[jobId]">,
) {
  await requireAdmin();
  const { jobId } = await props.params;

  const job = await getAdminPartnerJob(jobId);
  if (!job) notFound();

  const invoiced = Boolean(job.company?.invoices_enabled);
  const clientId = job.company?.client_id ?? null;
  const [events, invoices, clientInvoices, payments] = await Promise.all([
    getAdminPartnerJobEvents(jobId),
    invoiced ? getInvoicesForJob(jobId) : Promise.resolve([]),
    invoiced && clientId ? getInvoicesForClient(clientId) : Promise.resolve([]),
    invoiced ? getAdminPartnerJobPayments(jobId) : Promise.resolve([]),
  ]);
  // Only the company's invoices that bill no job yet can be attached here.
  const linkable = clientInvoices.filter((invoice) => !invoice.design_job_id);

  const jobLevelFiles = job.files.filter((file) => !file.item_id);

  return (
    <>
      <Link
        href="/partner-jobs"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm transition-colors md:min-h-9"
      >
        <ArrowLeft className="size-4" />
        Partner jobs
      </Link>

      <PageHeader title={job.job_number} description={job.job_name}>
        <JobStatusBadge status={job.status} className="h-7 self-start sm:self-center" />
        <Button asChild variant="outline">
          <Link href={`/partner-jobs/${job.id}/edit`}>
            <Pencil className="size-4" />
            Edit job &amp; files
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Submission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Detail label="Partner">{job.company?.name ?? "—"}</Detail>
              <Detail label="Submitted by">
                {job.submitted_by_name ?? job.submitted_by_email ?? "—"}
              </Detail>
              <Detail label="Submitted">
                {formatDateTime(job.created_at)}
              </Detail>
            </dl>

            {job.submitted_by_email ? (
              <div className="border-glass-border border-t pt-4">
                {/* max-w-full + truncate: buttonVariants sets whitespace-nowrap,
                    so a long address used to run past the card (which clips it
                    with overflow-hidden) on a phone. */}
                <Button asChild variant="outline" size="sm" className="max-w-full">
                  <a href={`mailto:${job.submitted_by_email}`}>
                    <Mail className="size-4" />
                    <span className="truncate">{job.submitted_by_email}</span>
                  </a>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <PartnerJobStatusForm id={job.id} status={job.status} />
          </CardContent>
        </Card>

        {invoiced ? (
          <Card>
            <CardHeader>
              <CardTitle>
                Invoice
                <span className="text-muted-foreground ml-2 font-normal">
                  {invoices.length}
                </span>
              </CardTitle>
              <CardAction>
                <Button asChild size="sm">
                  <Link href={`/invoices/new?job=${job.id}`}>
                    <Plus className="size-4" />
                    New invoice
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <JobInvoiceList
                invoices={invoices}
                invoiceHref="/invoices"
                emptyNote={`No invoice yet. Create one, then record deposits and payments on it — ${job.company?.name ?? "the partner"} sees it once it's no longer a draft.`}
                rowAction={(invoice) => (
                  <form action={unlinkInvoiceFromJobAction}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <Button type="submit" variant="ghost" size="sm" title="Detach from this job">
                      <Unlink className="size-4" />
                      <span className="sr-only sm:not-sr-only">Detach</span>
                    </Button>
                  </form>
                )}
              />
              {linkable.length > 0 ? (
                <div className="border-glass-border border-t pt-4">
                  <AdminLinkInvoiceForm jobId={job.id} invoices={linkable} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/*
          The job payment log (20260930024624) — the same list the partner sees
          on their job page, and either side can add to it. Separate from the
          invoice's own payments above, which stay the studio's ledger.
        */}
        {invoiced ? (
          <Card>
            <CardHeader>
              <CardTitle>
                Payments
                <span className="text-muted-foreground ml-2 font-normal">
                  {payments.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <JobPayments
                jobId={job.id}
                payments={payments}
                viewer="studio"
                companyName={job.company?.name ?? "Partner"}
                recordAction={recordStudioJobPaymentAction}
                deleteAction={deleteStudioJobPaymentAction}
              />
            </CardContent>
          </Card>
        ) : null}

        {/*
          The same rows the notification emails are dispatched from — every
          entry here either did, or deliberately did not, send one (see
          NOTIFIABLE_PARTNER_JOB_EVENTS). Read through the service role, like
          every other partner read on this page.
        */}
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <JobActivity events={events} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Products
              <span className="text-muted-foreground ml-2 font-normal">
                {job.items.length}
              </span>
            </CardTitle>
            {job.files.length > 1 ? (
              <CardAction>
                <DownloadAllFilesButton
                  files={job.files}
                  jobNumber={job.job_number}
                  label="Download all job files"
                />
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            <JobProductList
              items={job.items}
              files={job.files}
              jobNumber={job.job_number}
            />
          </CardContent>
        </Card>

        {/*
          Only files that belong to the JOB rather than to one of its products —
          in practice, jobs filed before artwork moved onto the products. The
          per-product files are rendered inside their product above, so listing
          the whole set here again would show every file twice. Hidden entirely
          when there are none, which is every job filed since.
        */}
        {jobLevelFiles.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>
                Job files
                <span className="text-muted-foreground ml-2 font-normal">
                  {jobLevelFiles.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <JobFileList files={jobLevelFiles} jobNumber={job.job_number} />
            </CardContent>
          </Card>
        ) : null}

        {job.notes ? (
          <Card>
            <CardHeader>
              <CardTitle>Job notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{job.notes}</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
