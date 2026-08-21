import "server-only";

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { CLIP_PATH, DIE_PATH, DIE_TX, DIE_TY, IMG_RECT, PAGE_H, PAGE_W, type Seg } from "@/lib/mockup/geometry";

import type { ExportRequest } from "./export-schema";
import { MAX_OUTPUT_PIXELS } from "./limits";

/**
 * Server-side composition of the Bag Mockup Grid — renders each image as the
 * exact same die-cut bag mockup as the live single-bag tool, then arranges
 * them into a fixed 4-column, auto-row grid. No labels, no per-image
 * zoom/pan/fit controls (always auto cover-fit), no background choice
 * (always white) — this tool is deliberately simpler than the 8-piece sheet.
 *
 * `lib/mockup/geometry.ts`'s `renderMockup()` only runs in a browser
 * <canvas>, so it can't be reused directly here — instead this ports the same
 * die-line/clip/gloss math to SVG (rasterized once per bag via sharp), using
 * the *exact same* path data imported from that module so the two renderers
 * can never drift apart.
 */

export class MockupGridInputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MockupGridInputError";
  }
}

export interface GridFile {
  id: string;
  bytes: Buffer;
}

function buildPathD(segments: Seg[], X: (x: number) => number, Y: (y: number) => number): string {
  let d = "";
  for (const seg of segments) {
    if (seg[0] === "m") d += `M ${X(seg[1])} ${Y(seg[2])} `;
    else if (seg[0] === "l") d += `L ${X(seg[1])} ${Y(seg[2])} `;
    else if (seg[0] === "c") {
      d += `C ${X(seg[1])} ${Y(seg[2])}, ${X(seg[3])} ${Y(seg[4])}, ${X(seg[5])} ${Y(seg[6])} `;
    } else if (seg[0] === "h") d += "Z ";
  }
  return d.trim();
}

/** Render one bag mockup (transparent PNG) from a flat artwork buffer, at the
 * given DPI. Same look as renderMockup()'s defaults: gloss + die-line on,
 * shadow off, transparent background. */
async function renderSingleBagPng(
  imageBytes: Buffer,
  dpi: number,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const s = dpi / 72;
  const W = Math.round(PAGE_W * s);
  const H = Math.round(PAGE_H * s);

  const dieX = (x: number) => (DIE_TX + x) * s;
  const dieY = (y: number) => (PAGE_H - (DIE_TY + y)) * s;
  const dieD = buildPathD(DIE_PATH, dieX, dieY);

  const clipX = (x: number) => x * s;
  const clipY = (y: number) => (PAGE_H - y) * s;
  const clipD = buildPathD(CLIP_PATH, clipX, clipY);

  const rx = IMG_RECT.x * s;
  const ry = (PAGE_H - (IMG_RECT.y + IMG_RECT.h)) * s;
  const rw = IMG_RECT.w * s;
  const rh = IMG_RECT.h * s;

  let meta;
  try {
    meta = await sharp(imageBytes, { failOn: "none" }).rotate().metadata();
    if (!meta.width || !meta.height) throw new Error("missing dimensions");
  } catch (err) {
    throw new MockupGridInputError(
      "One of the uploaded files couldn't be read as an image. It may be corrupt or an unsupported format.",
      { cause: err },
    );
  }

  const fit = Math.max(rw / meta.width, rh / meta.height);
  const dw = meta.width * fit;
  const dh = meta.height * fit;
  const drawX = rx + (rw - dw) / 2;
  const drawY = ry + (rh - dh) / 2;

  const resized = await sharp(imageBytes, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .resize(Math.max(1, Math.round(dw)), Math.max(1, Math.round(dh)), { fit: "fill" })
    .png()
    .toBuffer();
  const artDataUri = `data:image/png;base64,${resized.toString("base64")}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <clipPath id="dieClip"><path d="${dieD}"/></clipPath>
      <clipPath id="artClip"><path d="${clipD}"/></clipPath>
      <linearGradient id="g1" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.14"/>
        <stop offset="0.22" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="0.46" stop-color="#ffffff" stop-opacity="0.10"/>
        <stop offset="0.55" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.07"/>
      </linearGradient>
      <linearGradient id="g2" x1="0" y1="0" x2="${W}" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0.16" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="0.24" stop-color="#ffffff" stop-opacity="0.16"/>
        <stop offset="0.3" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="0.7" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="0.78" stop-color="#ffffff" stop-opacity="0.08"/>
        <stop offset="0.86" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="g3" x1="0" y1="0" x2="${W}" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#000000" stop-opacity="0.14"/>
        <stop offset="0.08" stop-color="#000000" stop-opacity="0"/>
        <stop offset="0.92" stop-color="#000000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.14"/>
      </linearGradient>
    </defs>
    <path d="${dieD}" fill="#ffffff"/>
    <g clip-path="url(#artClip)">
      <image x="${drawX}" y="${drawY}" width="${dw}" height="${dh}" href="${artDataUri}" preserveAspectRatio="none"/>
    </g>
    <g clip-path="url(#dieClip)">
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g1)"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g2)"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#g3)"/>
    </g>
    <path d="${dieD}" fill="none" stroke="#000000" stroke-width="${1 * s}"/>
  </svg>`;

  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buffer, width: W, height: H };
}

const COLUMNS = 4;
const GUTTER_PT = 14;
const MARGIN_PT = 24;

function toZeroOffsetBytes(buf: Uint8Array): Uint8Array {
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

interface GridLayout {
  rows: number;
  cellWidthPt: number;
  cellHeightPt: number;
  gridWidthPt: number;
  gridHeightPt: number;
}

function computeLayout(count: number): GridLayout {
  const rows = Math.ceil(count / COLUMNS);
  const cellWidthPt = PAGE_W;
  const cellHeightPt = PAGE_H;
  return {
    rows,
    cellWidthPt,
    cellHeightPt,
    gridWidthPt: MARGIN_PT * 2 + COLUMNS * cellWidthPt + (COLUMNS - 1) * GUTTER_PT,
    gridHeightPt: MARGIN_PT * 2 + rows * cellHeightPt + (rows - 1) * GUTTER_PT,
  };
}

async function renderGridSvg(request: ExportRequest, files: GridFile[]): Promise<{ svg: string; widthPx: number; heightPx: number }> {
  const s = request.dpi / 72;
  const byId = new Map(files.map((f) => [f.id, f.bytes]));
  const layout = computeLayout(request.order.length);

  const widthPx = Math.round(layout.gridWidthPt * s);
  const heightPx = Math.round(layout.gridHeightPt * s);
  if (widthPx * heightPx > MAX_OUTPUT_PIXELS) {
    throw new MockupGridInputError(
      "That many images at this resolution would produce too large an image. Remove a few images or lower the resolution.",
    );
  }

  const cellWPx = Math.round(layout.cellWidthPt * s);
  const cellHPx = Math.round(layout.cellHeightPt * s);
  const gutterPx = GUTTER_PT * s;
  const marginPx = MARGIN_PT * s;

  const images: string[] = [];
  for (let i = 0; i < request.order.length; i++) {
    const id = request.order[i];
    const bytes = byId.get(id);
    if (!bytes) continue; // metadata/file mismatch — leave this position empty
    const { buffer } = await renderSingleBagPng(bytes, request.dpi);
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const x = marginPx + col * (cellWPx + gutterPx);
    const y = marginPx + row * (cellHPx + gutterPx);
    const dataUri = `data:image/png;base64,${buffer.toString("base64")}`;
    images.push(`<image x="${x}" y="${y}" width="${cellWPx}" height="${cellHPx}" href="${dataUri}"/>`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
    <rect x="0" y="0" width="${widthPx}" height="${heightPx}" fill="#ffffff"/>
    ${images.join("")}
  </svg>`;

  return { svg, widthPx, heightPx };
}

export interface ComposedRaster {
  bytes: Buffer;
  width: number;
  height: number;
}

export async function composeBagGridRaster(
  request: ExportRequest,
  files: GridFile[],
  rasterFormat: "png" | "jpg",
): Promise<ComposedRaster> {
  const { svg, widthPx, heightPx } = await renderGridSvg(request, files);
  const pipeline = sharp(Buffer.from(svg), { density: 72 });
  const bytes =
    rasterFormat === "jpg"
      ? await pipeline
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
          .toBuffer()
      : await pipeline.png().toBuffer();
  return { bytes, width: widthPx, height: heightPx };
}

export async function composeBagGridPdf(request: ExportRequest, files: GridFile[]): Promise<Uint8Array> {
  const { bytes } = await composeBagGridRaster(request, files, "png");
  const layout = computeLayout(request.order.length);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([layout.gridWidthPt, layout.gridHeightPt]);
  const image = await pdf.embedPng(toZeroOffsetBytes(bytes));
  page.drawImage(image, { x: 0, y: 0, width: layout.gridWidthPt, height: layout.gridHeightPt });
  return pdf.save();
}
