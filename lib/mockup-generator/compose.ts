import "server-only";

import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

import type { ExportRequest } from "./export-schema";
import { computeDrawRect } from "./geometry";
import { EIGHT_PIECE_TEMPLATE } from "./templates/eight-piece";

/**
 * Server-side composition of the final 8-piece sheet — the "stage 2" renderer
 * that produces deterministic, viewport-independent PNG/JPG/PDF output.
 *
 * Approach: build ONE SVG document for the whole sheet — a `<clipPath>` +
 * `<image>` pair per occupied slot, each image pre-resized (via sharp) to its
 * exact final pixel size before being embedded as a base64 data URI — then
 * rasterize that SVG in a single sharp pass. SVG's `clipPath` is exactly the
 * primitive needed for the rounded-rect artwork windows, and doing all 8 in
 * one document avoids any ambiguity around out-of-bounds `sharp.composite()`
 * offsets when a cover-fit/zoomed image overflows its slot. `computeDrawRect`
 * (lib/mockup-generator/geometry.ts) is the exact same function the browser
 * preview uses, so exported pixels match what was previewed.
 */

export class MockupInputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MockupInputError";
  }
}

export interface SlotFile {
  slotId: string;
  bytes: Buffer;
}

async function decodedSize(bytes: Buffer): Promise<{ width: number; height: number }> {
  try {
    const meta = await sharp(bytes, { failOn: "none" }).rotate().metadata();
    if (!meta.width || !meta.height) throw new Error("missing dimensions");
    return { width: meta.width, height: meta.height };
  } catch (err) {
    throw new MockupInputError(
      "One of the uploaded files couldn't be read as an image. It may be corrupt or an unsupported format.",
      { cause: err },
    );
  }
}

/** Resize to the exact final pixel box and encode as a PNG data URI. Always
 * PNG regardless of the sheet's output format — the embed is an intermediate,
 * not the deliverable, and PNG keeps alpha for slots that need it. */
async function toResizedPngDataUri(
  bytes: Buffer,
  width: number,
  height: number,
): Promise<string> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const buf = await sharp(bytes, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .resize(w, h, { fit: "fill" })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function slotClipId(slotId: string): string {
  return `slot-clip-${slotId}`;
}

interface SheetSvgOptions {
  request: ExportRequest;
  files: SlotFile[];
  /** Overrides `request.background` — JPEG has no alpha channel, so the
   * caller always forces "white" regardless of the user's selection. */
  background: "white" | "transparent";
}

async function buildSheetSvg({ request, files, background }: SheetSvgOptions): Promise<string> {
  const scale = request.dpi / 72;
  const pageWidthPx = Math.round(EIGHT_PIECE_TEMPLATE.width * scale);
  const pageHeightPx = Math.round(EIGHT_PIECE_TEMPLATE.height * scale);

  const slotById = new Map(EIGHT_PIECE_TEMPLATE.slots.map((s) => [s.id, s]));
  const fileById = new Map(files.map((f) => [f.slotId, f.bytes]));

  const defs: string[] = [];
  const layers: string[] = [];

  for (const placement of request.placements) {
    const slot = slotById.get(placement.slotId);
    const fileBytes = fileById.get(placement.slotId);
    if (!slot || !fileBytes) continue; // no matching file for this slot — leave it empty

    const natural = await decodedSize(fileBytes);
    const rect = computeDrawRect(slot, natural.width, natural.height, placement.fitMode, placement.transform);

    const px = { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale };
    const slotPx = {
      x: slot.x * scale,
      y: slot.y * scale,
      width: slot.width * scale,
      height: slot.height * scale,
      r: slot.cornerRadius * scale,
    };

    const dataUri = await toResizedPngDataUri(fileBytes, px.width, px.height);
    const clipId = slotClipId(slot.id);

    defs.push(
      `<clipPath id="${clipId}"><rect x="${slotPx.x}" y="${slotPx.y}" width="${slotPx.width}" height="${slotPx.height}" rx="${slotPx.r}" ry="${slotPx.r}"/></clipPath>`,
    );
    // A white backing rect under the image, clipped to the same window, so a
    // "contain"-fit image (smaller than the slot on one axis) never shows a
    // transparent/black gap inside its own rounded-rect frame.
    layers.push(
      `<rect x="${slotPx.x}" y="${slotPx.y}" width="${slotPx.width}" height="${slotPx.height}" rx="${slotPx.r}" ry="${slotPx.r}" fill="#ffffff" clip-path="url(#${clipId})"/>`,
      `<image x="${px.x}" y="${px.y}" width="${px.width}" height="${px.height}" href="${dataUri}" xlink:href="${dataUri}" clip-path="url(#${clipId})" preserveAspectRatio="none"/>`,
    );
  }

  const backgroundRect =
    background === "white"
      ? `<rect x="0" y="0" width="${pageWidthPx}" height="${pageHeightPx}" fill="${EIGHT_PIECE_TEMPLATE.backgroundColor}"/>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pageWidthPx}" height="${pageHeightPx}" viewBox="0 0 ${pageWidthPx} ${pageHeightPx}"><defs>${defs.join("")}</defs>${backgroundRect}${layers.join("")}</svg>`;
}

/**
 * Return a Uint8Array backed by a fresh, zero-`byteOffset` ArrayBuffer.
 * pdf-lib's PngEmbedder does `new DataView(data.buffer)` and reads from
 * offset 0, ignoring the typed array's own `byteOffset` — a Buffer that
 * happens to be a view into Node's shared pool would then be read from the
 * wrong position. Copying the exact range guarantees `byteOffset === 0`
 * (same fix as `lib/cutline/compose.ts`).
 */
function toZeroOffsetBytes(buf: Uint8Array): Uint8Array {
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

export interface ComposedRaster {
  bytes: Buffer;
  width: number;
  height: number;
}

/** Render the sheet to a raster buffer (PNG, or JPG flattened onto white). */
export async function composeMockupRaster(
  request: ExportRequest,
  files: SlotFile[],
  rasterFormat: "png" | "jpg",
): Promise<ComposedRaster> {
  const scale = request.dpi / 72;
  const width = Math.round(EIGHT_PIECE_TEMPLATE.width * scale);
  const height = Math.round(EIGHT_PIECE_TEMPLATE.height * scale);

  const svg = await buildSheetSvg({
    request,
    files,
    background: rasterFormat === "jpg" ? "white" : request.background,
  });

  const pipeline = sharp(Buffer.from(svg), { density: 72 });
  const bytes =
    rasterFormat === "jpg"
      ? await pipeline
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
          .toBuffer()
      : await pipeline.png().toBuffer();

  return { bytes, width, height };
}

/** Wrap a rendered sheet in a single-page PDF sized to the template's true
 * physical dimensions (points) — raster quality is controlled by `dpi`
 * independently of the page's physical size, exactly like the QR/cutline PDF
 * exports elsewhere in this app. */
export async function composeMockupPdf(
  request: ExportRequest,
  files: SlotFile[],
): Promise<Uint8Array> {
  const { bytes } = await composeMockupRaster(request, files, "png");

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([EIGHT_PIECE_TEMPLATE.width, EIGHT_PIECE_TEMPLATE.height]);
  const image = await pdf.embedPng(toZeroOffsetBytes(bytes));
  page.drawImage(image, { x: 0, y: 0, width: EIGHT_PIECE_TEMPLATE.width, height: EIGHT_PIECE_TEMPLATE.height });
  return pdf.save();
}
