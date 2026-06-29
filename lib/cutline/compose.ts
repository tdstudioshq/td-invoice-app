import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import { getCutlinePreset, type CutlinePreset } from "./presets";

/**
 * Server-side composition of a print-ready cutline PDF.
 *
 * Mirrors the Python `cutline-bulk-engine` engine exactly:
 *   1. Output page size === the cutline PDF's first-page MediaBox (the contour
 *      defines the print bounds; default is 288×360pt = 4×5″).
 *   2. The artwork fills that page (1200×1500px art → 300 DPI).
 *   3. The vector cutline page is composited ON TOP, embedded as a Form XObject
 *      so its `/Separation /CutContour` spot colour survives untouched — never
 *      rasterised or recoloured.
 *
 * All work is server-only (sharp + pdf-lib); nothing here runs in the browser.
 */

export type FitMode = "cover" | "contain" | "stretch";

/** Bottom-left origin, matching pdf-lib's coordinate system. */
function fitRect(
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
  fit: FitMode,
): { x: number; y: number; width: number; height: number } {
  if (fit === "stretch") {
    return { x: 0, y: 0, width: pageW, height: pageH };
  }

  const imgRatio = imgW / imgH;
  const pageRatio = pageW / pageH;

  if (fit === "contain") {
    if (imgRatio > pageRatio) {
      const width = pageW;
      const height = pageW / imgRatio;
      return { x: 0, y: (pageH - height) / 2, width, height };
    }
    const height = pageH;
    const width = pageH * imgRatio;
    return { x: (pageW - width) / 2, y: 0, width, height };
  }

  // cover — fill the page, preserving ratio, centering the overflow.
  if (imgRatio > pageRatio) {
    const height = pageH;
    const width = pageH * imgRatio;
    return { x: (pageW - width) / 2, y: 0, width, height };
  }
  const width = pageW;
  const height = pageW / imgRatio;
  return { x: 0, y: (pageH - height) / 2, width, height };
}

// Cutline PDFs are small and immutable for the life of the process — cache the
// bytes per asset so a batch doesn't re-read the file for every image.
const cutlineBytesCache = new Map<string, Promise<Buffer>>();

function loadCutlineBytes(preset: CutlinePreset): Promise<Buffer> {
  let cached = cutlineBytesCache.get(preset.file);
  if (!cached) {
    // Inline literal dir (not a const) so Turbopack statically scopes the trace
    // to this subfolder instead of the whole project. Keep in sync with
    // CUTLINE_ASSET_DIR. The file is still bundled via outputFileTracingIncludes.
    cached = readFile(path.join(process.cwd(), "public/assets/cutlines", preset.file));
    cutlineBytesCache.set(preset.file, cached);
  }
  return cached;
}

interface NormalizedImage {
  bytes: Buffer;
  /** "png" preserves transparency; "jpg" is used for opaque artwork. */
  format: "png" | "jpg";
  width: number;
  height: number;
}

/**
 * Normalise arbitrary JPG/PNG input into bytes pdf-lib can reliably embed.
 * Mirrors the engine's PIL step (exif_transpose + convert to RGB) and additionally
 * rescues CMYK / 16-bit / grayscale inputs that raw pdf-lib rejects. Transparency
 * is preserved as PNG; opaque art is re-encoded as high-quality 4:4:4 JPEG.
 */
async function normalizeImage(input: Buffer): Promise<NormalizedImage> {
  const base = sharp(input, { failOn: "none" }).rotate(); // rotate() auto-orients from EXIF
  const meta = await base.metadata();
  const hasAlpha = Boolean(meta.hasAlpha);

  if (hasAlpha) {
    const { data, info } = await base
      .clone()
      .toColourspace("srgb")
      .png()
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, format: "png", width: info.width, height: info.height };
  }

  const { data, info } = await base
    .clone()
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, format: "jpg", width: info.width, height: info.height };
}

export interface ComposeOptions {
  presetId?: string | null;
  fit?: FitMode;
}

/**
 * Compose a single print-ready cutline PDF from raw artwork bytes.
 * Returns the PDF as bytes (the caller persists / streams it).
 */
export async function composeCutlinePdf(
  imageBytes: Buffer,
  options: ComposeOptions = {},
): Promise<Uint8Array> {
  const preset = getCutlinePreset(options.presetId);
  const fit: FitMode = options.fit ?? "cover";

  const [normalized, cutlineBytes] = await Promise.all([
    normalizeImage(imageBytes),
    loadCutlineBytes(preset),
  ]);

  const pdf = await PDFDocument.create();

  // Page size is dictated by the cutline overlay's first page.
  const [cutlinePage] = await pdf.embedPdf(cutlineBytes, [0]);
  const pageW = cutlinePage.width;
  const pageH = cutlinePage.height;
  const page = pdf.addPage([pageW, pageH]);

  // Base layer: artwork.
  const image =
    normalized.format === "png"
      ? await pdf.embedPng(normalized.bytes)
      : await pdf.embedJpg(normalized.bytes);
  const rect = fitRect(normalized.width, normalized.height, pageW, pageH, fit);
  page.drawImage(image, rect);

  // Overlay: vector cutline, full page, 1:1 (spot colour preserved).
  page.drawPage(cutlinePage, { x: 0, y: 0, width: pageW, height: pageH });

  return pdf.save();
}
