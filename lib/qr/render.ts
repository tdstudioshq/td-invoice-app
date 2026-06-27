// Browser-side QR rendering with styling + logo embedding. Pure functions that
// take a value + QrStyle and return a PNG data URL or an SVG string. The logo
// overlay uses a canvas / Image, so the logo-bearing paths must run in the
// browser (they're only ever called from client event handlers / effects).

import QRCode from "qrcode";

import type { QrStyle } from "@/lib/qr/style";

const RENDER_SIZE = 1024;
const LOGO_RATIO = 0.22; // logo width as a fraction of the QR width
const KNOCKOUT_PAD = 0.12; // background padding around the logo, fraction of logo

function pngOptions(style: QrStyle) {
  return {
    errorCorrectionLevel: style.ecc,
    margin: 2,
    width: RENDER_SIZE,
    color: { dark: style.fg, light: style.bg },
  } as const;
}

/** High-resolution PNG data URL, with an optional centered logo. */
export async function renderQrPng(
  value: string,
  style: QrStyle,
): Promise<string> {
  const base = await QRCode.toDataURL(value, pngOptions(style));
  if (!style.logo) return base;
  return overlayLogoPng(base, style);
}

async function overlayLogoPng(
  qrDataUrl: string,
  style: QrStyle,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = RENDER_SIZE;
  canvas.height = RENDER_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx || !style.logo) return qrDataUrl;

  const qr = await loadImage(qrDataUrl);
  ctx.drawImage(qr, 0, 0, RENDER_SIZE, RENDER_SIZE);

  const logo = await loadImage(style.logo);
  const size = RENDER_SIZE * LOGO_RATIO;
  const pos = (RENDER_SIZE - size) / 2;
  const pad = size * KNOCKOUT_PAD;

  // Knock out a rounded background behind the logo so it stays scannable.
  ctx.fillStyle = style.bg;
  roundRect(ctx, pos - pad, pos - pad, size + pad * 2, size + pad * 2, size * 0.18);
  ctx.fill();
  ctx.drawImage(logo, pos, pos, size, size);

  return canvas.toDataURL("image/png");
}

/** SVG markup, with an optional centered logo embedded as a data URL <image>. */
export async function renderQrSvg(
  value: string,
  style: QrStyle,
): Promise<string> {
  let svg = await QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: style.ecc,
    margin: 2,
    color: { dark: style.fg, light: style.bg },
  });

  if (style.logo) {
    // qrcode emits viewBox="0 0 N N" in module units; place the logo in those.
    const match = svg.match(/viewBox="0 0 ([\d.]+) /);
    const n = match ? Number.parseFloat(match[1]) : 0;
    if (n) {
      const size = n * LOGO_RATIO;
      const pos = (n - size) / 2;
      const pad = size * KNOCKOUT_PAD;
      const rect = `<rect x="${pos - pad}" y="${pos - pad}" width="${
        size + pad * 2
      }" height="${size + pad * 2}" rx="${size * 0.18}" fill="${style.bg}"/>`;
      const image = `<image x="${pos}" y="${pos}" width="${size}" height="${size}" href="${style.logo}" preserveAspectRatio="xMidYMid meet"/>`;
      svg = svg.replace("</svg>", `${rect}${image}</svg>`);
    }
  }

  return svg;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
