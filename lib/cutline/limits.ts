/**
 * Shared safety limits + naming for the public Cutline Generator.
 *
 * Server- and client-safe (no `fs`, no Supabase, no `server-only`) so the route
 * handler and the browser UI enforce the exact same rules.
 */

/** Per-image upload cap. 1200×1500 JPG/PNG art is well under this. */
export const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB

/** Max images accepted in a single batch — bounds memory + abuse on a public tool. */
export const MAX_BATCH = 25;

/**
 * The only image types we accept. `image/jpg` is non-standard but some browsers
 * / operating systems report JPEGs that way, so we accept it alongside the
 * canonical `image/jpeg`. PDFs and everything else are rejected (no entry here,
 * and the extension regex below only matches jpg/jpeg/png).
 */
export const ACCEPTED_MIME = ["image/jpeg", "image/jpg", "image/png"];
export const ACCEPTED_EXT = /\.(jpe?g|png)$/i;

/** True when a file looks like an accepted JPG/PNG (by MIME or extension). */
export function isAcceptedImage(type: string | undefined, name: string): boolean {
  return (
    (typeof type === "string" && ACCEPTED_MIME.includes(type.toLowerCase())) ||
    ACCEPTED_EXT.test(name)
  );
}

/**
 * Sniff the real image type from the file's magic bytes. This is authoritative —
 * MIME type and extension can both lie (a renamed PDF, a misreported upload), so
 * we never trust them alone for what actually gets decoded.
 *   JPEG → FF D8 FF
 *   PNG  → 89 50 4E 47 (full signature 89 50 4E 47 0D 0A 1A 0A)
 */
export function sniffImageMagic(bytes: Uint8Array): "jpg" | "png" | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
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
  return null;
}

/** Hex preview of the first `n` bytes for error messages, e.g. "FF D8 FF E0". */
export function magicHead(bytes: Uint8Array, n = 4): string {
  return Array.from(bytes.subarray(0, n))
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

/** Derive the output PDF filename from the uploaded image name (sanitised). */
export function pdfNameFor(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? name)
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 200);
  return `${base || "cutline"}.pdf`;
}
