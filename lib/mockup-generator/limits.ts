/**
 * Shared safety limits for the 8-Piece Mockup Generator. Server- and
 * client-safe (no `fs`, no Supabase, no `server-only`) — mirrors
 * `lib/cutline/limits.ts` so the route handler and the browser UI enforce the
 * exact same rules.
 */

export const MAX_SLOTS = 8;

/** Per-image upload cap — configurable here, not scattered through the UI. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

/** Guards the combined request body of an up-to-8-file export request well
 * under Vercel's Functions body-size ceiling, so an oversized batch fails
 * fast client-side with an actionable message instead of a platform 413. */
export const MAX_TOTAL_BYTES = 80 * 1024 * 1024; // 80 MB

export const ACCEPTED_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;
export const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp";
export const ALLOWED_TYPES_LABEL = "PNG, JPG, or WEBP";

/** True when a file looks like an accepted image (by MIME or extension). */
export function isAcceptedImage(type: string | undefined, name: string): boolean {
  return (
    (typeof type === "string" && ACCEPTED_MIME.includes(type.toLowerCase())) ||
    ACCEPTED_EXT.test(name)
  );
}

/**
 * Sniff the real image type from the file's magic bytes — authoritative,
 * since MIME type and extension can both lie.
 *   JPEG → FF D8 FF
 *   PNG  → 89 50 4E 47
 *   WEBP → "RIFF"···"WEBP" (bytes 0-3 and 8-11)
 */
export function sniffImageMagic(bytes: Uint8Array): "jpg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

/** Hex preview of the first `n` bytes for error messages, e.g. "FF D8 FF E0". */
export function magicHead(bytes: Uint8Array, n = 4): string {
  return Array.from(bytes.subarray(0, n))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

/** Derive the output filename from the sheet's export format. */
export function sheetNameFor(format: "png" | "jpg" | "pdf"): string {
  return `mockup-sheet.${format}`;
}
