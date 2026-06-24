import { getCompanySettings, getInvoice } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { STATUS_LABEL, effectiveStatus } from "@/lib/invoice";
import { renderInvoicePdf, type InvoicePdfData } from "@/lib/pdf/invoice-pdf";

// GET /api/invoices/[id]/pdf — download a TD Studios invoice as a PDF.
//
// Security: this route is NOT covered by the proxy (the matcher excludes /api),
// so it enforces auth itself. `getInvoice` uses the cookie-scoped SSR Supabase
// client, so RLS only ever returns an invoice the signed-in user owns — a user
// requesting someone else's id gets `null` here and a 404. No service-role /
// RLS bypass is used.
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/invoices/[id]/pdf">,
) {
  const user = await getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const invoice = await getInvoice(id);
  if (!invoice) {
    return new Response("Not found", { status: 404 });
  }

  const settings = await getCompanySettings();
  const status = effectiveStatus(invoice);
  const amountPaid = invoice.payments.reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );

  const data: InvoicePdfData = {
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

  const pdf = await renderInvoicePdf(data);

  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
