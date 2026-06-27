// Browser-side single-page PDF export for a QR code, built with pdf-lib (already
// a project dependency, used server-side for invoices). Embeds a pre-rendered
// PNG (logo already baked in) centered on US Letter with a title + caption.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const QR_SIZE = 320;

export async function renderQrPdf(
  pngDataUrl: string,
  opts: { title: string; subtitle?: string },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const png = await pdf.embedPng(dataUrlToBytes(pngDataUrl));

  const qrX = (PAGE_W - QR_SIZE) / 2;
  const qrY = PAGE_H - 160 - QR_SIZE;
  page.drawImage(png, { x: qrX, y: qrY, width: QR_SIZE, height: QR_SIZE });

  const titleSize = 22;
  const titleWidth = bold.widthOfTextAtSize(opts.title, titleSize);
  page.drawText(opts.title, {
    x: (PAGE_W - titleWidth) / 2,
    y: qrY - 48,
    size: titleSize,
    font: bold,
    color: rgb(0.07, 0.07, 0.07),
  });

  if (opts.subtitle) {
    const subSize = 12;
    const subWidth = font.widthOfTextAtSize(opts.subtitle, subSize);
    page.drawText(opts.subtitle, {
      x: (PAGE_W - subWidth) / 2,
      y: qrY - 70,
      size: subSize,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  return pdf.save();
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
