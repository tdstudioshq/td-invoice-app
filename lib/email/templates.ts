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
