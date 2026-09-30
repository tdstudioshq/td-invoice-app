import "server-only";

import { createCanvas } from "@napi-rs/canvas";
import { after } from "next/server";
import sharp from "sharp";

import { PARTNER_JOB_BUCKET } from "@/lib/partner-jobs/action-constants";
import { partnerExtensionOf, partnerPreviewPath } from "@/lib/partner-jobs/uploads";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

/**
 * First-page WebP previews for partner PDFs.
 *
 * Supabase's image transform — which gives every raster file its web-sized
 * thumbnail — cannot read a PDF, and a PDF is what a rep most often sends. So a
 * PDF's first page is rendered here ONCE, with pdf.js on @napi-rs/canvas, and
 * stored beside the original at partnerPreviewPath(). Every later request is an
 * ordinary signed URL to that WebP, and the grid runs it through the same
 * transform as any image.
 *
 * Measured on the production bucket: a 5.8 MB press PDF renders in ~0.6 s to a
 * ~480 KB 1600px WebP (and ~50 KB once transformed down to a grid thumbnail).
 *
 * Rendered in TWO places, both idempotent: right after a job is saved (in
 * `after()`, so the rep never waits on it), and lazily by the file route when a
 * preview is asked for and missing — which is also how every PDF filed before
 * this existed gets one, with no backfill step.
 *
 * SERVICE ROLE, deliberately and narrowly. A preview is a derived artifact,
 * never a user write: by the time anything here runs the caller has already
 * been authorized to read the original (the file route reads the row through
 * the caller's own client first). The only object it ever writes is the
 * preview key derived from a path that already exists in `design_job_files`.
 */

/** Long edge of a stored preview. Big enough for a detail tile at 2-3x DPR. */
export const PREVIEW_LONG_EDGE = 1600;
const PREVIEW_QUALITY = 80;
/** Past this pdf.js can take long enough to matter inside a request. */
const MAX_RENDER_BYTES = 60 * 1024 * 1024;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

/**
 * pdf.js on the main thread. In Node it looks for `globalThis.pdfjsWorker`
 * before trying to spawn a worker from a file path, so importing the worker
 * module STATICALLY here is what makes it run inside a serverless function —
 * and what lets the file tracer see the worker at all.
 */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  })();
  return pdfjsPromise;
}

/** Render page 1 of a PDF to a WebP no larger than PREVIEW_LONG_EDGE. */
export async function renderPdfPreview(bytes: Uint8Array): Promise<Buffer> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: bytes,
    // Fonts a PDF references but does not embed. Traced into the function by
    // outputFileTracingIncludes in next.config.ts.
    standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const unit = page.getViewport({ scale: 1 });
    const scale = PREVIEW_LONG_EDGE / Math.max(unit.width, unit.height);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    // PDFs are routinely transparent; WebP keeps alpha, but a white page is
    // what the artwork is designed against.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    // @napi-rs/canvas implements the 2D API pdf.js draws with; its types are
    // simply not the DOM's.
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    const png: Buffer = await canvas.encode("png");
    return await sharp(png).webp({ quality: PREVIEW_QUALITY }).toBuffer();
  } finally {
    await task.destroy();
  }
}

function needsRenderedPreview(storagePath: string): boolean {
  return partnerExtensionOf(storagePath) === "pdf";
}

/**
 * Make sure one PDF has its stored preview; returns the preview key, or null
 * when the file is not a PDF or cannot be rendered. Callers must already have
 * authorized the caller against `storagePath`.
 */
export async function ensurePartnerPdfPreview(
  storagePath: string,
): Promise<string | null> {
  if (!needsRenderedPreview(storagePath) || !isSupabaseAdminConfigured()) return null;
  const previewPath = partnerPreviewPath(storagePath);
  const storage = createAdminClient().storage.from(PARTNER_JOB_BUCKET);

  const { data: existing } = await storage.info(previewPath);
  if (existing) return previewPath;

  const { data: blob, error: downloadError } = await storage.download(storagePath);
  if (downloadError || !blob) {
    console.error("ensurePartnerPdfPreview download", downloadError?.message);
    return null;
  }
  if (blob.size > MAX_RENDER_BYTES) return null;

  let webp: Buffer;
  try {
    webp = await renderPdfPreview(new Uint8Array(await blob.arrayBuffer()));
  } catch (error) {
    console.error(
      "ensurePartnerPdfPreview render",
      error instanceof Error ? error.message : "unknown error",
    );
    return null;
  }

  // Upsert, so two concurrent first views both succeed with the same bytes.
  const { error: uploadError } = await storage.upload(previewPath, webp, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: true,
  });
  if (uploadError) {
    console.error("ensurePartnerPdfPreview upload", uploadError.message);
    return null;
  }
  return previewPath;
}

/**
 * Render previews for freshly saved files, sequentially — one PDF at a time
 * keeps a 20-file job inside a function's memory. Never throws.
 */
export async function ensurePartnerPdfPreviews(storagePaths: string[]): Promise<void> {
  for (const path of storagePaths) {
    if (!needsRenderedPreview(path)) continue;
    try {
      await ensurePartnerPdfPreview(path);
    } catch (error) {
      console.error(
        "ensurePartnerPdfPreviews",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  }
}

/**
 * Schedule preview rendering for just-saved files once the response has gone
 * out, so filing a job never waits on pdf.js. The file route renders anything
 * this misses, so a failure here only costs the first viewer a second.
 */
export function renderPartnerPreviewsAfterResponse(storagePaths: string[]): void {
  if (!storagePaths.some(needsRenderedPreview)) return;
  try {
    after(() => ensurePartnerPdfPreviews(storagePaths));
  } catch (error) {
    // after() throws outside a request scope; a preview is never worth failing
    // a write that has already committed.
    console.error(
      "renderPartnerPreviewsAfterResponse",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}
