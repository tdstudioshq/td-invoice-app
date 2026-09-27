import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr";

import { StatusBadge } from "@/components/invoices/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import {
  PAYMENT_KIND_LABEL,
  effectiveStatus,
  summarizePayments,
} from "@/lib/invoice";
import {
  getPartnerCompanyBySlug,
  partnerBasePath,
  partnerHref,
  requirePartnerSession,
} from "@/lib/partner-jobs/context";
import { getPartnerJobLabels } from "@/lib/partner-jobs/queries";
import { getInvoice } from "@/lib/queries/invoices";

export const metadata = { title: "Invoice" };

function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div
      data-strong={strong}
      className="flex items-center justify-between data-[strong=true]:border-glass-border data-[strong=true]:border-t data-[strong=true]:pt-2 data-[strong=true]:font-semibold"
    >
      <span className={strong ? undefined : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

/**
 * One invoice, read-only. RLS (`invoices_partner_select`) is the gate: an
 * invoice that is a draft, unlinked, or on another company's job resolves to
 * null and 404s. The PDF comes from the same /api/invoices/[id]/pdf route the
 * studio uses, which reads through the rep's own session.
 */
export default async function PartnerInvoicePage({
  params,
}: PageProps<"/partner/[slug]/invoices/[invoiceId]">) {
  const { slug, invoiceId } = await params;
  await requirePartnerSession(slug, `/invoices/${invoiceId}`);
  const company = await getPartnerCompanyBySlug(slug);
  if (!company?.invoices_enabled) notFound();
  const basePath = await partnerBasePath(slug);

  const invoice = await getInvoice(invoiceId);
  if (!invoice || !invoice.design_job_id) notFound();

  const job = (await getPartnerJobLabels([invoice.design_job_id])).get(
    invoice.design_job_id,
  );
  const money = summarizePayments(invoice.total, invoice.payments);
  const payments = [...invoice.payments].sort((a, b) =>
    a.payment_date.localeCompare(b.payment_date),
  );

  return (
    <>
      <Link
        href={partnerHref(basePath, "/invoices")}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm transition-colors md:min-h-9"
      >
        <ArrowLeftIcon className="size-4" />
        All invoices
      </Link>

      <PageHeader
        title={invoice.invoice_number}
        description={job ? `${job.job_number} — ${job.job_name}` : undefined}
      >
        <div className="flex items-center gap-3">
          <StatusBadge status={effectiveStatus(invoice)} className="h-7" />
          <Button asChild variant="outline" className="w-full sm:w-auto">
            {/* A download, not a navigation: /api is outside the proxy, so
                this resolves on the subdomain as well as the main site. */}
            <a href={`/api/invoices/${invoice.id}/pdf`}>
              <DownloadSimpleIcon className="size-4" />
              Download PDF
            </a>
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground text-sm md:text-xs">Issued</dt>
                <dd className="mt-0.5 text-sm">{formatDate(invoice.issue_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm md:text-xs">Due</dt>
                <dd className="mt-0.5 text-sm">{formatDate(invoice.due_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm md:text-xs">Paid</dt>
                <dd className="mt-0.5 text-sm tabular-nums">{formatCurrency(money.paid)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm md:text-xs">Balance due</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                  {formatCurrency(money.balance)}
                </dd>
              </div>
            </dl>
            {job ? (
              <Link
                href={partnerHref(basePath, `/jobs/${invoice.design_job_id}`)}
                className="text-muted-foreground hover:text-foreground mt-4 inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline md:min-h-9"
              >
                View job {job.job_number}
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {invoice.invoice_items.length === 0 ? (
              <p className="text-muted-foreground text-sm">No line items.</p>
            ) : (
              <ul className="divide-glass-border divide-y">
                {invoice.invoice_items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="break-words">{item.description || "—"}</p>
                      <p className="text-muted-foreground mt-0.5 tabular-nums md:text-xs">
                        {item.quantity} × {formatCurrency(item.unit_price)}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums">
                      {formatCurrency(Number(item.quantity) * Number(item.unit_price))}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="ml-auto w-full space-y-2 text-sm sm:max-w-xs">
              <Row label="Subtotal" value={invoice.subtotal} />
              {Number(invoice.discount_amount) > 0 ? (
                <Row
                  label={`Discount (${formatPercent(invoice.discount_rate)})`}
                  value={-invoice.discount_amount}
                />
              ) : null}
              {Number(invoice.tax_amount) > 0 ? (
                <Row label={`Tax (${formatPercent(invoice.tax_rate)})`} value={invoice.tax_amount} />
              ) : null}
              <Row label="Total" value={invoice.total} strong />
              <Row label="Paid" value={-money.paid} />
              <Row label="Balance due" value={money.balance} strong />
            </div>

            {invoice.notes ? (
              <p className="text-muted-foreground text-sm whitespace-pre-line">{invoice.notes}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deposits &amp; payments</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-glass-border divide-y">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p>
                        {PAYMENT_KIND_LABEL[payment.kind]}
                        <span className="text-muted-foreground">
                          {" "}· {formatDate(payment.payment_date)}
                          {payment.method ? ` · ${payment.method}` : ""}
                        </span>
                      </p>
                      {payment.notes ? (
                        <p className="text-muted-foreground mt-0.5 break-words md:text-xs">
                          {payment.notes}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 tabular-nums">{formatCurrency(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
