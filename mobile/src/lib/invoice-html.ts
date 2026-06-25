import { effectiveStatus, formatCurrency, formatDate } from "@/src/lib/format";
import type {
  CompanySettings,
  InvoiceWithRelations,
} from "@/src/types/database";

function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Multi-line text → escaped HTML with <br>. */
function escapeMultiline(value: string | null | undefined): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

/**
 * Builds a self-contained, print-ready HTML invoice from data the app already
 * fetches. This is the OFFLINE FALLBACK for the PDF viewer: when the web app's
 * authoritative pdf-lib PDF can't be fetched (no web app URL configured, or no
 * connection), it's rendered in a WebView for preview and handed to expo-print
 * to export a shareable PDF. It is a mobile re-creation — close to, but not
 * byte-identical with, the web/emailed pdf-lib output. See
 * `src/components/invoice-pdf.tsx` for the primary path.
 */
export function buildInvoiceHtml(
  invoice: InvoiceWithRelations,
  settings: CompanySettings | null,
): string {
  const status = effectiveStatus(invoice);
  const companyName = escapeHtml(settings?.company_name ?? "TD Studios");

  const companyLines = [settings?.address, settings?.email, settings?.phone]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  const client = invoice.client;
  const clientLines = client
    ? [
        `<div class="bill-name">${escapeHtml(client.company_name)}</div>`,
        client.contact_name ? `<div>${escapeHtml(client.contact_name)}</div>` : "",
        client.email ? `<div>${escapeHtml(client.email)}</div>` : "",
        client.phone ? `<div>${escapeHtml(client.phone)}</div>` : "",
        client.address ? `<div>${escapeHtml(client.address)}</div>` : "",
      ].join("")
    : `<div class="bill-name">No client</div>`;

  const itemRows =
    invoice.invoice_items.length > 0
      ? invoice.invoice_items
          .map((item) => {
            const amount = Number(item.quantity) * Number(item.unit_price);
            return `
              <tr>
                <td>${escapeHtml(item.description) || "&nbsp;"}</td>
                <td class="num">${Number(item.quantity)}</td>
                <td class="num">${formatCurrency(item.unit_price)}</td>
                <td class="num">${formatCurrency(amount)}</td>
              </tr>`;
          })
          .join("")
      : `<tr><td colspan="4" class="muted">No line items.</td></tr>`;

  const discountRow =
    Number(invoice.discount_amount) > 0
      ? `<tr><td>Discount (${Number(invoice.discount_rate)}%)</td><td class="num">-${formatCurrency(invoice.discount_amount)}</td></tr>`
      : "";

  const taxRow =
    Number(invoice.tax_amount) > 0
      ? `<tr><td>Tax (${Number(invoice.tax_rate)}%)</td><td class="num">${formatCurrency(invoice.tax_amount)}</td></tr>`
      : "";

  const notesBlock = invoice.notes
    ? `<div class="block"><div class="block-title">Notes</div><div class="muted">${escapeMultiline(invoice.notes)}</div></div>`
    : "";

  const paymentInstructions = settings?.payment_instructions
    ? `<div class="block"><div class="block-title">Payment instructions</div><div class="muted">${escapeMultiline(settings.payment_instructions)}</div></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 28px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #18181b;
    background: #ffffff;
    font-size: 13px;
    line-height: 1.5;
  }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .company-name { font-size: 20px; font-weight: 700; }
  .company-meta { color: #52525b; margin-top: 4px; }
  .doc { text-align: right; }
  .doc-label { font-size: 22px; font-weight: 700; letter-spacing: 1px; color: #f97316; }
  .doc-number { margin-top: 4px; font-weight: 600; }
  .status {
    display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 999px;
    border: 1px solid #d4d4d8; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #52525b;
  }
  .status.paid { color: #15803d; border-color: #15803d; }
  .status.overdue { color: #b91c1c; border-color: #b91c1c; }
  .status.sent { color: #0369a1; border-color: #0369a1; }
  .grid { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; }
  .bill-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #a1a1aa; margin-bottom: 6px; }
  .bill-name { font-weight: 600; }
  .dates div { margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 28px; }
  thead th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;
    color: #a1a1aa; border-bottom: 2px solid #e4e4e7; padding: 8px 6px;
  }
  tbody td { padding: 10px 6px; border-bottom: 1px solid #f4f4f5; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .muted { color: #52525b; }
  .totals { margin-top: 18px; display: flex; justify-content: flex-end; }
  .totals table { width: 260px; margin-top: 0; }
  .totals td { padding: 6px 6px; border: none; }
  .totals .grand td { border-top: 2px solid #e4e4e7; font-size: 16px; font-weight: 700; padding-top: 10px; }
  .block { margin-top: 24px; }
  .block-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #a1a1aa; margin-bottom: 6px; }
</style>
</head>
<body>
  <div class="top">
    <div>
      <div class="company-name">${companyName}</div>
      <div class="company-meta">${companyLines}</div>
    </div>
    <div class="doc">
      <div class="doc-label">INVOICE</div>
      <div class="doc-number">${escapeHtml(invoice.invoice_number)}</div>
      <div class="status ${status}">${status}</div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="bill-label">Bill to</div>
      ${clientLines}
    </div>
    <div class="dates">
      <div><strong>Issued:</strong> ${formatDate(invoice.issue_date)}</div>
      <div><strong>Due:</strong> ${formatDate(invoice.due_date)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit price</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td class="num">${formatCurrency(invoice.subtotal)}</td></tr>
      ${discountRow}
      ${taxRow}
      <tr class="grand"><td>Total</td><td class="num">${formatCurrency(invoice.total)}</td></tr>
    </table>
  </div>

  ${notesBlock}
  ${paymentInstructions}
</body>
</html>`;
}
