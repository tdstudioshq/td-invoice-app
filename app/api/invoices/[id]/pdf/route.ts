import { getCompanySettings, getInvoice } from "@/lib/data";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { buildInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";

// GET /api/invoices/[id]/pdf — download a TD Studios invoice as a PDF.
//
// Security: this route is NOT covered by the proxy (the matcher excludes /api),
// so it enforces auth itself. It accepts either the web app's auth cookies or a
// Supabase access token via `Authorization: Bearer` (used by the mobile app).
// Either way `getInvoice` runs through the RLS-scoped SSR client, so RLS only
// ever returns an invoice the signed-in user owns (or, for a portal user, the
// invoices of their one client) — a user requesting someone else's id gets
// `null` here and a 404. No service-role / RLS bypass is used.
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/invoices/[id]/pdf">,
) {
  if (!isSupabaseConfigured()) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = await createClient();
  const authorization = req.headers.get("authorization");
  const token = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : null;
  // `getUser(token)` revalidates the token with the Supabase Auth server; the
  // no-arg form revalidates the cookie session. Neither trusts an unverified
  // token.
  const {
    data: { user },
  } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
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
