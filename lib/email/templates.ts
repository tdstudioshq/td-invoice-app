// Plain, light-themed HTML email templates (no react-email dependency — kept
// lightweight). Each builder returns { subject, html, text }. Email clients
// render poorly with dark themes and modern CSS, so these use simple inline
// styles on a white background.

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
    <tr><td style="padding:28px 32px;">
      <p style="margin:0 0 20px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#71717a;">TD Studios</p>
      ${bodyHtml}
    </td></tr>
  </table>
  <p style="max-width:520px;margin:16px auto 0;font-size:11px;color:#a1a1aa;text-align:center;">TD Studios · This is an automated message.</p>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(
    label,
  )}</a>`;
}

/** Email accompanying an invoice PDF attachment. */
export function invoiceEmail(params: {
  companyName: string;
  clientName: string;
  invoiceNumber: string;
  formattedTotal: string;
  dueDate: string;
}): EmailContent {
  const { companyName, clientName, invoiceNumber, formattedTotal, dueDate } =
    params;

  const subject = `Invoice ${invoiceNumber} from ${companyName}`;
  const html = shell(`
    <h1 style="margin:0 0 12px;font-size:20px;">Invoice ${escapeHtml(
      invoiceNumber,
    )}</h1>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3f3f46;">
      Hi ${escapeHtml(clientName)}, please find invoice
      <strong>${escapeHtml(invoiceNumber)}</strong> from ${escapeHtml(
        companyName,
      )} attached as a PDF.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px;color:#3f3f46;">
      <tr><td style="padding:2px 0;color:#71717a;">Amount due</td><td style="padding:2px 0 2px 24px;font-weight:600;">${escapeHtml(
        formattedTotal,
      )}</td></tr>
      <tr><td style="padding:2px 0;color:#71717a;">Due date</td><td style="padding:2px 0 2px 24px;">${escapeHtml(
        dueDate,
      )}</td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#71717a;">Thank you for your business.</p>
  `);
  const text = `Invoice ${invoiceNumber} from ${companyName}

Hi ${clientName}, please find invoice ${invoiceNumber} attached as a PDF.

Amount due: ${formattedTotal}
Due date: ${dueDate}

Thank you for your business.`;

  return { subject, html, text };
}

/** Invite a client to their secure portal (set-password link). */
export function portalInviteEmail(params: {
  companyName: string;
  actionUrl: string;
}): EmailContent {
  const { companyName, actionUrl } = params;

  const subject = `Your ${companyName} client portal`;
  const html = shell(`
    <h1 style="margin:0 0 12px;font-size:20px;">You've been invited</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3f3f46;">
      ${escapeHtml(
        companyName,
      )} has set up a secure client portal where you can view your files and
      invoices. Set your password to get started.
    </p>
    <p style="margin:0 0 20px;">${button(actionUrl, "Set your password")}</p>
    <p style="margin:0;font-size:13px;color:#71717a;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <span style="color:#3f3f46;word-break:break-all;">${escapeHtml(
        actionUrl,
      )}</span>
    </p>
  `);
  const text = `You've been invited to the ${companyName} client portal.

Set your password to get started:
${actionUrl}

If you weren't expecting this, you can ignore this email.`;

  return { subject, html, text };
}

/**
 * Internal notification for a new Custom Mylar Printing quote request
 * (/mylar-printing). Goes to TD Studios, never to the customer — so it carries
 * the full request, including the admin deep link.
 *
 * Artwork is referenced, never attached: the files live in the private
 * `mylar-artwork` bucket and are reachable only through the admin-guarded
 * /api/mylar-artwork route, which mints a 60-second signed URL per view. A
 * production PSD would also blow past Resend's attachment ceiling.
 */
export function mylarInquiryEmail(params: {
  referenceNumber: string;
  bagType: string;
  quantity: number;
  designCount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  brandName: string | null;
  /** Already labelled ("Text" / "Call" / "Email"), or "—" if not stated. */
  contactMethod: string;
  /** `YYYY-MM-DD`, or null when no deadline was given. */
  neededBy: string | null;
  artworkSummary: string;
  notes: string | null;
  adminUrl: string;
}): EmailContent {
  const {
    referenceNumber,
    bagType,
    quantity,
    designCount,
    customerName,
    customerEmail,
    customerPhone,
    brandName,
    contactMethod,
    neededBy,
    artworkSummary,
    notes,
    adminUrl,
  } = params;

  const subject = `New Mylar Printing Request — ${referenceNumber}`;

  // Ordered for a human deciding how to make first contact: what the job is,
  // then who to reach and how. "Contact via" sits directly under the phone and
  // email it refers to.
  const rows: [string, string][] = [
    ["Reference", referenceNumber],
    ["Bag type", bagType],
    ["Quantity", `${quantity.toLocaleString()} pieces`],
    ["Designs", `${designCount} ${designCount === 1 ? "design" : "designs"}`],
    ["Needed by", neededBy || "No deadline given"],
    ["Artwork", artworkSummary],
    ["Name", customerName],
    ["Brand", brandName || "—"],
    ["Email", customerEmail],
    ["Phone", customerPhone || "—"],
    ["Contact via", contactMethod],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 0;color:#71717a;white-space:nowrap;">${escapeHtml(
          label,
        )}</td><td style="padding:4px 0 4px 24px;color:#18181b;">${escapeHtml(
          value,
        )}</td></tr>`,
    )
    .join("");

  const notesHtml = notes
    ? `<p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#3f3f46;white-space:pre-wrap;"><strong style="color:#71717a;font-weight:600;">Notes</strong><br>${escapeHtml(
        notes,
      )}</p>`
    : "";

  const html = shell(`
    <h1 style="margin:0 0 12px;font-size:20px;">New printing request</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3f3f46;">
      ${escapeHtml(customerName)} submitted a custom mylar printing request.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:14px;">
      ${rowsHtml}
    </table>
    ${notesHtml}
    <p style="margin:0 0 20px;">${button(adminUrl, "Open request")}</p>
    <p style="margin:0;font-size:13px;color:#71717a;">
      Artwork is stored with the request — open it in the dashboard to view or
      download the files.
    </p>
  `);

  const text = `New Mylar Printing Request — ${referenceNumber}

${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}
${notes ? `\nNotes:\n${notes}\n` : ""}
Open request: ${adminUrl}

Artwork is stored with the request — open it in the dashboard to view or download the files.`;

  return { subject, html, text };
}
