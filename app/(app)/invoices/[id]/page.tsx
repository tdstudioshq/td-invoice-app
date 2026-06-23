import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import {
  deleteInvoiceAction,
  updateInvoiceAction,
} from "@/app/actions/invoices";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { InvoiceStatusControl } from "@/components/invoices/invoice-status-control";
import { StatusBadge } from "@/components/invoices/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getClients,
  getCompanySettings,
  getInvoice,
} from "@/lib/data";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { effectiveStatus } from "@/lib/invoice";

export async function generateMetadata(props: PageProps<"/invoices/[id]">) {
  const { id } = await props.params;
  const invoice = await getInvoice(id);
  return { title: invoice?.invoice_number ?? "Invoice" };
}

export default async function InvoiceDetailPage(
  props: PageProps<"/invoices/[id]">,
) {
  const { id } = await props.params;
  const { edit } = await props.searchParams;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  const isEditing = edit === "1";

  if (isEditing) {
    const [clients, settings] = await Promise.all([
      getClients(),
      getCompanySettings(),
    ]);
    const updateAction = updateInvoiceAction.bind(null, id);

    return (
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href={`/invoices/${id}`}>
            <ArrowLeft />
            Back to invoice
          </Link>
        </Button>
        <PageHeader
          title={`Edit ${invoice.invoice_number}`}
          description="Update details and line items."
        />
        <InvoiceForm
          action={updateAction}
          clients={clients}
          invoice={invoice}
          defaultTaxRate={settings?.tax_rate ?? 0}
          submitLabel="Save changes"
        />
      </div>
    );
  }

  const settings = await getCompanySettings();
  const items = invoice.invoice_items
    .slice()
    .sort((a, b) => a.position - b.position);
  const totalPaid = invoice.payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const balance = Number(invoice.total) - totalPaid;

  return (
    <div className="mx-auto max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/invoices">
          <ArrowLeft />
          Back to invoices
        </Link>
      </Button>

      <PageHeader title={invoice.invoice_number}>
        <InvoiceStatusControl
          invoiceId={invoice.id}
          status={invoice.status}
        />
        <Button asChild variant="outline">
          <Link href={`/invoices/${invoice.id}?edit=1`}>
            <Pencil />
            Edit
          </Link>
        </Button>
        <ConfirmDeleteDialog
          action={deleteInvoiceAction}
          id={invoice.id}
          title="Delete invoice?"
          description="This permanently deletes the invoice and its line items."
        />
      </PageHeader>

      <Card>
        <CardContent className="space-y-8 pt-6">
          {/* From / To */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-1 text-xs uppercase">
                From
              </p>
              <p className="font-medium">
                {settings?.company_name ?? "TD Studios"}
              </p>
              {settings?.address ? (
                <p className="text-muted-foreground text-sm whitespace-pre-line">
                  {settings.address}
                </p>
              ) : null}
              {settings?.email ? (
                <p className="text-muted-foreground text-sm">
                  {settings.email}
                </p>
              ) : null}
              {settings?.phone ? (
                <p className="text-muted-foreground text-sm">
                  {settings.phone}
                </p>
              ) : null}
            </div>
            <div className="sm:text-right">
              <p className="text-muted-foreground mb-1 text-xs uppercase">
                Bill to
              </p>
              {invoice.client ? (
                <>
                  <p className="font-medium">
                    <Link
                      href={`/clients/${invoice.client.id}`}
                      className="hover:underline"
                    >
                      {invoice.client.company_name}
                    </Link>
                  </p>
                  {invoice.client.contact_name ? (
                    <p className="text-muted-foreground text-sm">
                      {invoice.client.contact_name}
                    </p>
                  ) : null}
                  {invoice.client.email ? (
                    <p className="text-muted-foreground text-sm">
                      {invoice.client.email}
                    </p>
                  ) : null}
                  {invoice.client.address ? (
                    <p className="text-muted-foreground text-sm whitespace-pre-line">
                      {invoice.client.address}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">No client</p>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="border-border grid gap-4 border-y py-4 text-sm sm:grid-cols-4">
            <Meta label="Status">
              <StatusBadge status={effectiveStatus(invoice)} />
            </Meta>
            <Meta label="Issued">{formatDate(invoice.issue_date)}</Meta>
            <Meta label="Due">{formatDate(invoice.due_date)}</Meta>
            <Meta label="Total">
              <span className="font-semibold">
                {formatCurrency(invoice.total)}
              </span>
            </Meta>
          </div>

          {/* Line items */}
          <div className="border-border overflow-x-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground text-center"
                    >
                      No line items
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.description || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(
                          Number(item.quantity) * Number(item.unit_price),
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Totals */}
          <div className="ml-auto w-full max-w-xs space-y-2 text-sm">
            <TotalRow label="Subtotal" value={invoice.subtotal} />
            <TotalRow
              label={`Discount (${formatPercent(invoice.discount_rate)})`}
              value={-invoice.discount_amount}
            />
            <TotalRow
              label={`Tax (${formatPercent(invoice.tax_rate)})`}
              value={invoice.tax_amount}
            />
            <div className="border-border flex items-center justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {formatCurrency(invoice.total)}
              </span>
            </div>
            {totalPaid > 0 ? (
              <>
                <TotalRow label="Paid" value={-totalPaid} />
                <TotalRow label="Balance due" value={balance} />
              </>
            ) : null}
          </div>

          {invoice.notes ? (
            <div>
              <p className="text-muted-foreground mb-1 text-xs uppercase">
                Notes
              </p>
              <p className="text-sm whitespace-pre-line">{invoice.notes}</p>
            </div>
          ) : null}

          {settings?.payment_instructions ? (
            <div>
              <p className="text-muted-foreground mb-1 text-xs uppercase">
                Payment instructions
              </p>
              <p className="text-sm whitespace-pre-line">
                {settings.payment_instructions}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No payments recorded yet.
              {/* TODO(stripe): record payments via Stripe and reconcile here. */}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatDate(payment.payment_date)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.method ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 text-xs uppercase">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}
