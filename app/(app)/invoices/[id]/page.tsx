import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Download, Pencil } from "lucide-react";

import {
  deleteInvoiceAction,
  updateInvoiceAction,
  updateInvoiceStatusAction,
} from "@/app/actions/invoices";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { InvoiceStatusControl } from "@/components/invoices/invoice-status-control";
import { PrintButton } from "@/components/invoices/print-button";
import { RecordPaymentDialog } from "@/components/invoices/record-payment-dialog";
import { SendInvoiceDialog } from "@/components/invoices/send-invoice-dialog";
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
  const companyName = settings?.company_name ?? "TD Studios";
  const status = effectiveStatus(invoice);
  const items = invoice.invoice_items
    .slice()
    .sort((a, b) => a.position - b.position);
  const totalPaid = invoice.payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const balance = Number(invoice.total) - totalPaid;

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      {/* Toolbar — never printed */}
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href="/invoices">
            <ArrowLeft />
            Back to invoices
          </Link>
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <InvoiceStatusControl invoiceId={invoice.id} status={invoice.status} />
        {status !== "paid" ? (
          <form action={updateInvoiceStatusAction}>
            <input type="hidden" name="id" value={invoice.id} />
            <input type="hidden" name="status" value="paid" />
            <Button type="submit">
              <Check />
              Mark paid
            </Button>
          </form>
        ) : null}
        <PrintButton />
        <Button asChild variant="outline">
          <a href={`/api/invoices/${invoice.id}/pdf`}>
            <Download />
            Download PDF
          </a>
        </Button>
        {invoice.client?.email ? (
          <SendInvoiceDialog
            invoiceId={invoice.id}
            recipientEmail={invoice.client.email}
          />
        ) : null}
        <RecordPaymentDialog invoiceId={invoice.id} balanceDue={balance} />
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
      </div>

      {/* Invoice document — the printable area */}
      <Card className="print:rounded-none print:border-0 print:shadow-none">
        <CardContent className="space-y-8 px-6 py-8 sm:px-10 print:px-0 print:py-0">
          {/* Branded header */}
          <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <Image
                src="/invoice-logo.png"
                alt="TD Studios TNT Printing logo"
                width={365}
                height={384}
                priority
                className="h-20 w-auto shrink-0 object-contain print:h-[0.8in]"
              />
              <div className="leading-tight">
                <p className="text-base font-semibold">{companyName}</p>
                <p className="text-muted-foreground text-[10px] tracking-[0.18em] uppercase">
                  Invoicing
                </p>
              </div>
            </div>
            <div className="sm:text-right">
              <h1 className="text-3xl font-bold tracking-tight">Invoice</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {invoice.invoice_number}
              </p>
              <div className="mt-2 sm:flex sm:justify-end">
                <StatusBadge status={status} />
              </div>
            </div>
          </header>

          {/* From / Bill to */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-1 text-xs uppercase">
                From
              </p>
              <p className="font-medium">{companyName}</p>
              {settings?.address ? (
                <p className="text-muted-foreground text-sm whitespace-pre-line">
                  {settings.address}
                </p>
              ) : null}
              {settings?.email ? (
                <p className="text-muted-foreground text-sm">{settings.email}</p>
              ) : null}
              {settings?.phone ? (
                <p className="text-muted-foreground text-sm">{settings.phone}</p>
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
                      className="hover:underline print:no-underline"
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

          {/* Meta strip */}
          <div className="border-border grid grid-cols-2 gap-4 border-y py-4 text-sm sm:grid-cols-4">
            <Meta label="Issued">{formatDate(invoice.issue_date)}</Meta>
            <Meta label="Due">{formatDate(invoice.due_date)}</Meta>
            <Meta label="Total">
              <span className="font-semibold">
                {formatCurrency(invoice.total)}
              </span>
            </Meta>
            <Meta label="Balance due">
              <span className="font-semibold">{formatCurrency(balance)}</span>
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
          <div className="ml-auto w-full space-y-2 text-sm sm:max-w-xs">
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
            <TotalRow label="Amount paid" value={-totalPaid} />
            <div className="border-border flex items-center justify-between border-t pt-2 font-semibold">
              <span>Balance due</span>
              <span className="tabular-nums">{formatCurrency(balance)}</span>
            </div>
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

      {/* Payments log — management only, never printed */}
      <Card className="mt-6 print:hidden">
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No payments recorded yet.
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
