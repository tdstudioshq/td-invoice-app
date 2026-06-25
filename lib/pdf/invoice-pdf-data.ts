import { formatDate } from "@/lib/format";
import { STATUS_LABEL, effectiveStatus } from "@/lib/invoice";
import type { InvoicePdfData } from "@/lib/pdf/invoice-pdf";
import type {
  CompanySettings,
  InvoiceWithRelations,
} from "@/lib/types/database";

/**
 * Map a fully-loaded invoice + company settings to the shape `renderInvoicePdf`
 * expects. Shared by the PDF download route (`/api/invoices/[id]/pdf`) and the
 * email-invoice action so the emailed and downloaded PDFs are identical.
 */
export function buildInvoicePdfData(
  invoice: InvoiceWithRelations,
  settings: CompanySettings | null,
): InvoicePdfData {
  const status = effectiveStatus(invoice);
  const amountPaid = invoice.payments.reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );

  return {
    company: {
      name: settings?.company_name ?? "TD Studios",
      address: settings?.address,
      email: settings?.email,
      phone: settings?.phone,
      paymentInstructions: settings?.payment_instructions,
    },
    client: invoice.client
      ? {
          name: invoice.client.company_name,
          contactName: invoice.client.contact_name,
          email: invoice.client.email,
          address: invoice.client.address,
        }
      : null,
    invoiceNumber: invoice.invoice_number,
    status,
    statusLabel: STATUS_LABEL[status],
    issueDate: formatDate(invoice.issue_date),
    dueDate: formatDate(invoice.due_date),
    items: invoice.invoice_items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
      })),
    subtotal: Number(invoice.subtotal),
    discountRate: Number(invoice.discount_rate),
    discountAmount: Number(invoice.discount_amount),
    taxRate: Number(invoice.tax_rate),
    taxAmount: Number(invoice.tax_amount),
    total: Number(invoice.total),
    amountPaid,
    balanceDue: Number(invoice.total) - amountPaid,
    notes: invoice.notes,
  };
}
