/**
 * Shared safety limits for the Bag Mockup Grid. Server- and client-safe (no
 * `fs`, no Supabase, no `server-only`) — same pattern as `lib/cutline/limits.ts`
 * and `lib/mockup-generator/limits.ts`, kept as its own small file rather than
 * imported cross-tool (matching how cutline and the 8-piece tool each own
 * their own limits rather than sharing one).
 */

/** Bounds memory/compute on a public, no-auth page — 40 images is 10 rows of 4. */
export const MAX_IMAGES = 40;

/** Per-image upload cap. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

/** Guards the combined export request body well under Vercel's Functions
 * body-size ceiling. */
export const MAX_TOTAL_BYTES = 80 * 1024 * 1024; // 80 MB

/** Safety valve on the rendered output itself — a 40-image grid at the
 * highest DPI could otherwise ask sharp to rasterize an unreasonably large
 * canvas. Rejected with a clear message rather than timing out or OOMing. */
export const MAX_OUTPUT_PIXELS = 120_000_000;

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

/** Hex preview of the first `n` bytes for error messages. */
export function magicHead(bytes: Uint8Array, n = 4): string {
  return Array.from(bytes.subarray(0, n))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

/** Derive the output filename from the grid's export format. */
export function gridNameFor(format: "png" | "jpg" | "pdf"): string {
  return `bag-mockup-grid.${format}`;
}
