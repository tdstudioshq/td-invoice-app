import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type RGB,
} from "pdf-lib";

import type { InvoiceStatus } from "@/lib/types/database";

// Pure, dependency-light invoice PDF renderer. It takes already-computed display
// data (status, formatted dates) so it depends only on pdf-lib — the route
// handler is responsible for auth/RLS and for mapping the DB rows to this shape.

export interface InvoicePdfData {
  company: {
    name: string;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    paymentInstructions?: string | null;
  };
  client: {
    name: string;
    contactName?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
  invoiceNumber: string;
  status: InvoiceStatus;
  statusLabel: string;
  issueDate: string; // pre-formatted, e.g. "Jun 24, 2026" or "—"
  dueDate: string;
  items: { description: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discountRate: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  notes?: string | null;
}

// Letter, points.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const RIGHT = PAGE_W - MARGIN; // 562
const CONTENT_W = PAGE_W - MARGIN * 2; // 512

const INK = rgb(0.09, 0.09, 0.11);
const MUTED = rgb(0.45, 0.45, 0.48);
const LINE = rgb(0.85, 0.85, 0.87);
const WHITE = rgb(1, 1, 1);

const STATUS_FILL: Record<InvoiceStatus, RGB> = {
  draft: rgb(0.42, 0.45, 0.5),
  sent: rgb(0.05, 0.5, 0.78),
  paid: rgb(0.06, 0.6, 0.4),
  overdue: rgb(0.83, 0.18, 0.18),
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (v: number) => currency.format(Number(v ?? 0));
const pct = (v: number) => `${parseFloat(Number(v ?? 0).toFixed(3))}%`;

// Helvetica StandardFont uses WinAnsi encoding; map smart punctuation to ASCII
// and replace anything it can't encode (CJK, emoji, control chars) so drawText
// never throws on arbitrary user input.
function safe(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

export async function renderInvoicePdf(
  data: InvoicePdfData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${safe(data.invoiceNumber)}`);
  doc.setCreator("TD Studios Invoicing");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const w = (s: string, f: PDFFont, sz: number) => f.widthOfTextAtSize(s, sz);
  const at = (s: string, x: number, base: number, f: PDFFont, sz: number, c: RGB = INK) =>
    page.drawText(safe(s), { x, y: base, size: sz, font: f, color: c });
  const atRight = (s: string, xr: number, base: number, f: PDFFont, sz: number, c: RGB = INK) =>
    at(s, xr - w(safe(s), f, sz), base, f, sz, c);

  const hline = (yy: number, x1 = MARGIN, x2 = RIGHT, color: RGB = LINE) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 1, color });

  function newPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }
  function ensure(space: number) {
    if (y - space < MARGIN) newPage();
  }

  // Word-wrap a single line (no newlines) to a max width.
  function wrap(text: string, f: PDFFont, sz: number, maxW: number): string[] {
    const words = safe(text).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (w(test, f, sz) > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ---- Header: TD branding (left) + INVOICE title/number/status (right) ----
  const top = y;
  page.drawRectangle({ x: MARGIN, y: top - 34, width: 34, height: 34, color: INK });
  at("TD", MARGIN + (34 - w("TD", bold, 14)) / 2, top - 23, bold, 14, WHITE);
  at(data.company.name, MARGIN + 46, top - 13, bold, 13);
  at("INVOICING", MARGIN + 46, top - 26, font, 8, MUTED);

  atRight("INVOICE", RIGHT, top - 20, bold, 26);
  atRight(data.invoiceNumber, RIGHT, top - 38, font, 11, MUTED);

  const pillText = data.statusLabel.toUpperCase();
  const pillW = w(safe(pillText), bold, 8) + 16;
  const pillX = RIGHT - pillW;
  page.drawRectangle({
    x: pillX,
    y: top - 60,
    width: pillW,
    height: 16,
    color: STATUS_FILL[data.status] ?? MUTED,
  });
  at(pillText, pillX + 8, top - 55, bold, 8, WHITE);

  y = top - 78;
  hline(y);
  y -= 22;

  // ---- From / Bill to ----
  const colX = MARGIN + 270;
  at("FROM", MARGIN, y, bold, 8, MUTED);
  at("BILL TO", colX, y, bold, 8, MUTED);

  const fromLines: { text: string; size: number; color: RGB }[] = [
    { text: data.company.name, size: 10, color: INK },
    ...(data.company.address ? data.company.address.split("\n") : []).map((t) => ({ text: t, size: 9, color: MUTED })),
    ...(data.company.email ? [{ text: data.company.email, size: 9, color: MUTED }] : []),
    ...(data.company.phone ? [{ text: data.company.phone, size: 9, color: MUTED }] : []),
  ];
  const toLines: { text: string; size: number; color: RGB }[] = data.client
    ? [
        { text: data.client.name, size: 10, color: INK },
        ...(data.client.contactName ? [{ text: data.client.contactName, size: 9, color: MUTED }] : []),
        ...(data.client.email ? [{ text: data.client.email, size: 9, color: MUTED }] : []),
        ...(data.client.address ? data.client.address.split("\n") : []).map((t) => ({ text: t, size: 9, color: MUTED })),
      ]
    : [{ text: "No client", size: 9, color: MUTED }];

  let ly = y - 15;
  for (const ln of fromLines) {
    for (const wl of wrap(ln.text, font, ln.size, 250)) {
      at(wl, MARGIN, ly, font, ln.size, ln.color);
      ly -= ln.size + 4;
    }
  }
  let ry = y - 15;
  for (const ln of toLines) {
    for (const wl of wrap(ln.text, font, ln.size, RIGHT - colX)) {
      at(wl, colX, ry, font, ln.size, ln.color);
      ry -= ln.size + 4;
    }
  }
  y = Math.min(ly, ry) - 14;

  // ---- Meta row: Issued / Due ----
  at("ISSUED", MARGIN, y, bold, 8, MUTED);
  at("DUE", MARGIN + 150, y, bold, 8, MUTED);
  y -= 14;
  at(data.issueDate, MARGIN, y, font, 10);
  at(data.dueDate, MARGIN + 150, y, font, 10);
  y -= 22;

  // ---- Line items table ----
  const qtyRight = MARGIN + 330;
  const unitRight = MARGIN + 430;
  const descWidth = qtyRight - MARGIN - 60;

  function tableHeader() {
    at("DESCRIPTION", MARGIN, y, bold, 8, MUTED);
    atRight("QTY", qtyRight, y, bold, 8, MUTED);
    atRight("UNIT PRICE", unitRight, y, bold, 8, MUTED);
    atRight("AMOUNT", RIGHT, y, bold, 8, MUTED);
    y -= 8;
    hline(y);
    y -= 14;
  }

  ensure(40);
  tableHeader();

  if (data.items.length === 0) {
    at("No line items", MARGIN, y, font, 9, MUTED);
    y -= 16;
  } else {
    for (const item of data.items) {
      const descLines = wrap(item.description || "-", font, 9, descWidth);
      const rowH = descLines.length * 12 + 6;
      if (y - rowH < MARGIN) {
        newPage();
        tableHeader();
      }
      const amount = Number(item.quantity) * Number(item.unitPrice);
      descLines.forEach((dl, i) => at(dl, MARGIN, y - i * 12, font, 9));
      atRight(String(item.quantity), qtyRight, y, font, 9);
      atRight(money(Number(item.unitPrice)), unitRight, y, font, 9);
      atRight(money(amount), RIGHT, y, font, 9);
      y -= rowH;
      hline(y + 3, MARGIN, RIGHT, rgb(0.93, 0.93, 0.94));
    }
  }

  // ---- Totals ----
  y -= 10;
  const labelX = MARGIN + 300;
  function totalRow(label: string, value: number, opts: { bold?: boolean } = {}) {
    ensure(16);
    const f = opts.bold ? bold : font;
    at(label, labelX, y, f, 10, opts.bold ? INK : MUTED);
    atRight(money(value), RIGHT, y, f, 10);
    y -= 16;
  }

  totalRow("Subtotal", data.subtotal);
  totalRow(`Discount (${pct(data.discountRate)})`, -data.discountAmount);
  totalRow(`Tax (${pct(data.taxRate)})`, data.taxAmount);
  y -= 2;
  hline(y + 6, labelX, RIGHT);
  totalRow("Total", data.total, { bold: true });
  totalRow("Amount paid", -data.amountPaid);
  hline(y + 6, labelX, RIGHT);
  totalRow("Balance due", data.balanceDue, { bold: true });

  // ---- Notes & payment instructions ----
  function paragraph(label: string, body: string | null | undefined) {
    if (!body || !body.trim()) return;
    y -= 14;
    ensure(28);
    at(label, MARGIN, y, bold, 8, MUTED);
    y -= 14;
    const lines = body.split("\n").flatMap((l) => wrap(l, font, 9, CONTENT_W));
    for (const ln of lines) {
      ensure(13);
      at(ln, MARGIN, y, font, 9);
      y -= 13;
    }
  }

  paragraph("NOTES", data.notes);
  paragraph("PAYMENT INSTRUCTIONS", data.company.paymentInstructions);

  return doc.save();
}
