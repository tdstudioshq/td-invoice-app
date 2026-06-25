import { getCompanySettings, getInvoice } from "@/lib/data";
import { getUser } from "@/lib/auth";
import { buildInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";

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
  const data = buildInvoicePdfData(invoice, settings);
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
