/**
 * Browser-side HEIC / TIFF -> JPEG conversion for partner job artwork.
 *
 * WHY THIS IS IN THE BROWSER. Partner uploads go browser -> Storage over a
 * signed URL and never pass through a Server Action, so converting on the
 * server would mean a download-convert-reupload round trip per file — the same
 * cost that ruled out generating thumbnails with `sharp` at upload time. The
 * bytes are already in the page; convert them there.
 *
 * WHY THE ALLOWLIST DID NOT MOVE. `ALLOWED_PARTNER_UPLOAD_EXTENSIONS` still
 * refuses .heic/.tiff, and that is the point: conversion runs BEFORE
 * validatePartnerUploadFile(), so only a real .jpg is ever offered to the
 * validator, minted a ticket, or written to the bucket. A press-unfriendly
 * source can reach the form but never reaches the studio.
 *
 * DECODING IS THE BROWSER'S, NOT OURS — no wasm decoder, no new dependency.
 * That means support follows the platform: Safari on iOS and macOS decodes
 * both HEIC and TIFF through the system ImageIO, while Chrome and Firefox
 * decode neither. The reps this exists for are on iPhones, which is exactly
 * where it works; anywhere else the caller gets a clear message instead of a
 * silent failure. Swapping in libheif/UTIF later means changing only
 * `decode()` below.
 */

import { CONVERTIBLE_TO_JPEG_EXTENSIONS, partnerExtensionOf } from "@/lib/partner-jobs/uploads";

/** Quality for the re-encode. High: these are press sources, not thumbnails. */
const JPEG_QUALITY = 0.92;

/**
 * Safari caps a canvas at 16,777,216 px of AREA, and past it silently hands
 * back a blank bitmap rather than throwing — a white JPEG that looks like a
 * successful upload until the studio opens it. Anything larger is scaled to
 * fit instead, and the caller is told it happened.
 */
const MAX_CANVAS_PIXELS = 16_777_216;

export class ImageConversionError extends Error {}

export interface ConvertedImage {
  file: File;
  /** True when the source exceeded the canvas ceiling and was scaled down. */
  downscaled: boolean;
}

/** Whether this file is one the browser should convert before anything else. */
export function needsJpegConversion(name: string): boolean {
  return (CONVERTIBLE_TO_JPEG_EXTENSIONS as readonly string[]).includes(
    partnerExtensionOf(name),
  );
}

/** `IMG_0458.TIFF` -> `IMG_0458.jpg`, preserving everything before the dot. */
export function convertedFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot === -1 ? name : name.slice(0, dot)}.jpg`;
}

async function decode(file: File): Promise<ImageBitmap> {
  try {
    // `from-image` applies the EXIF orientation tag. Without it every iPhone
    // photo taken in anything but the default orientation arrives rotated.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageConversionError(
      `this browser can't read ${partnerExtensionOf(file.name).toUpperCase()} files`,
    );
  }
}

/**
 * Re-encode one HEIC/TIFF as a JPEG File, ready to go through the normal
 * validate -> ticket -> upload path as if the rep had picked a JPEG.
 */
export async function convertToJpeg(file: File): Promise<ConvertedImage> {
  const bitmap = await decode(file);
  try {
    let { width, height } = bitmap;
    const area = width * height;
    const downscaled = area > MAX_CANVAS_PIXELS;
    if (downscaled) {
      const scale = Math.sqrt(MAX_CANVAS_PIXELS / area);
      width = Math.max(1, Math.floor(width * scale));
      height = Math.max(1, Math.floor(height * scale));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageConversionError("this browser has no 2D canvas");

    // JPEG carries no alpha channel. Painting white first keeps a transparent
    // source from compositing against black, which is what an unfilled canvas
    // would give — a design on a clear background arriving inverted.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size === 0) {
      throw new ImageConversionError("the converted image came back empty");
    }

    return {
      file: new File([blob], convertedFileName(file.name), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      }),
      downscaled,
    };
  } finally {
    // Frees the decoded pixels immediately rather than at the next GC — these
    // are 14 MB-a-piece on a phone.
    bitmap.close();
  }
}
