/**
 * Artwork upload rules for the Custom Mylar Printing wizard.
 *
 * Server- and client-safe (no `fs`, no Supabase, no `server-only`), mirroring
 * lib/uploads.ts so the browser rejects exactly what the server would. This is
 * a SEPARATE allowlist from lib/uploads.ts on purpose: the portal's list has no
 * TIFF (a staple of print artwork) and carries .webp/.gif/.svg/.zip, which are
 * not print sources. Widening the portal list to suit this form would quietly
 * widen what admins and portal users can upload too.
 *
 * Where the limits are actually enforced:
 *   1. Client pre-check (UX only — bypassable).
 *   2. mintMylarArtworkUploadAction — nothing uploads without a server-minted
 *      signed-URL ticket, and tickets are only issued for allowlisted
 *      extensions within MAX_ARTWORK_BYTES.
 *   3. The `mylar-artwork` bucket's file_size_limit (50 MB, migration 0023) —
 *      the authoritative byte cap Storage applies to the actual body.
 *   4. submitMylarInquiryAction re-checks each stored object via
 *      storage.info() before its path is written to the inquiry row.
 */

export const ALLOWED_ARTWORK_EXTENSIONS = [
  "ai",
  "pdf",
  "psd",
  "png",
  "jpg",
  "jpeg",
  "tif",
  "tiff",
] as const;

export type AllowedArtworkExtension =
  (typeof ALLOWED_ARTWORK_EXTENSIONS)[number];

/** Canonical Content-Type sent with the storage PUT for each extension. */
export const ARTWORK_EXTENSION_MIME: Record<AllowedArtworkExtension, string> = {
  ai: "application/pdf",
  pdf: "application/pdf",
  psd: "image/vnd.adobe.photoshop",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  tif: "image/tiff",
  tiff: "image/tiff",
};

/**
 * Reported MIME types tolerated per extension, beyond the canonical one.
 * Browsers report design formats as octet-stream or nothing at all constantly,
 * so a missing/octet-stream type is always accepted; we only reject a type that
 * actively contradicts the extension (e.g. a .png reported as text/html).
 * The browser-supplied type is advisory — the extension allowlist plus the
 * post-upload storage.info() check are what actually gate the file.
 */
const ACCEPTED_ARTWORK_MIME: Record<
  AllowedArtworkExtension,
  readonly string[]
> = {
  ai: ["application/pdf", "application/postscript", "application/illustrator"],
  pdf: ["application/pdf"],
  psd: [
    "image/vnd.adobe.photoshop",
    "application/x-photoshop",
    "application/photoshop",
    "application/psd",
    "image/psd",
  ],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  tif: ["image/tiff", "image/tif", "image/x-tiff"],
  tiff: ["image/tiff", "image/tif", "image/x-tiff"],
};

/** For <input type="file" accept={...}>. */
export const ARTWORK_ACCEPT_ATTRIBUTE = ALLOWED_ARTWORK_EXTENSIONS.map(
  (ext) => `.${ext}`,
).join(",");

export const ARTWORK_TYPES_LABEL = "AI, PDF, PSD, PNG, JPG, TIFF";

/**
 * 50 MB. Larger than the 25 MB used elsewhere in the app because production
 * print sources (layered PSD, flattened TIFF, packaged AI) routinely exceed
 * that. Safe because artwork goes browser -> Storage over a signed upload URL:
 * the bytes never pass through a Server Action (Next caps those at ~4 MB here)
 * or any Vercel function body. Keep in sync with the bucket's file_size_limit
 * in migration 0023.
 */
export const MAX_ARTWORK_BYTES = 50 * 1024 * 1024;

/** Longest original filename accepted, before sanitizing. */
export const MAX_ARTWORK_NAME_LENGTH = 200;

export function artworkExtensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isAllowedArtworkExtension(
  ext: string,
): ext is AllowedArtworkExtension {
  return (ALLOWED_ARTWORK_EXTENSIONS as readonly string[]).includes(ext);
}

/** Human-readable file size, e.g. 1536 -> "1.5 KB". Mirrors lib/portal.ts. */
export function formatArtworkBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const value = n / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

/** The Content-Type the storage object should carry for this file. */
export function resolveArtworkContentType(
  name: string,
  reported?: string | null,
): string {
  const ext = artworkExtensionOf(name);
  if (isAllowedArtworkExtension(ext)) return ARTWORK_EXTENSION_MIME[ext];
  return reported || "application/octet-stream";
}

/**
 * Validate a candidate artwork file by name, size, and (advisory) reported
 * MIME. Returns a human-readable error, or null when acceptable.
 */
export function validateArtworkFile(
  name: string,
  size: number,
  type?: string | null,
): string | null {
  if (!name || name.length > MAX_ARTWORK_NAME_LENGTH) {
    return "That filename is too long. Rename the file and try again.";
  }
  const ext = artworkExtensionOf(name);
  if (!isAllowedArtworkExtension(ext)) {
    return `${ext ? `.${ext} files` : "That file type"} can't be printed from. Upload ${ARTWORK_TYPES_LABEL}.`;
  }
  if (size <= 0) return "That file is empty.";
  if (size > MAX_ARTWORK_BYTES) {
    return `That file is ${formatArtworkBytes(size)} — the limit is ${formatArtworkBytes(MAX_ARTWORK_BYTES)}.`;
  }
  const reported = (type ?? "").toLowerCase().trim();
  if (
    reported &&
    reported !== "application/octet-stream" &&
    !ACCEPTED_ARTWORK_MIME[ext].includes(reported)
  ) {
    return `That file says it's ${reported}, which doesn't match its .${ext} extension.`;
  }
  return null;
}

/** Whether an uploaded artwork file can be shown as an <img> thumbnail. */
export function isPreviewableArtwork(name: string): boolean {
  const ext = artworkExtensionOf(name);
  return ext === "png" || ext === "jpg" || ext === "jpeg";
}

/**
 * Strip directories and unusual characters from an uploaded filename. Same
 * rules as lib/portal.ts `sanitizeFileName`, kept here so this module stays
 * standalone: path separators are removed first (so `../` can never survive),
 * then everything outside [A-Za-z0-9_.-] collapses to `_`.
 */
export function sanitizeArtworkName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/[^\w.\-]+/g, "_").slice(0, MAX_ARTWORK_NAME_LENGTH) || "artwork";
}

/**
 * Build the object key for one artwork file:
 *   {inquiryId}/{side}/{objectId}-{sanitized-name}
 *
 * `inquiryId` is the server-minted uuid that becomes the inquiry row's primary
 * key, and `objectId` is a fresh random uuid, so keys are never guessable and
 * two uploads of the same filename never collide. Both uuids are generated
 * server-side; this function only composes them.
 */
export function buildArtworkPath(
  inquiryId: string,
  side: "front" | "back",
  objectId: string,
  fileName: string,
): string {
  return `${inquiryId}/${side}/${objectId}-${sanitizeArtworkName(fileName)}`;
}

/** Matches exactly what buildArtworkPath produces for this inquiry + side. */
const UUID_RE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Whether `path` is a key this inquiry could legitimately own. Used server-side
 * before an uploaded object is claimed by a submission: the caller supplies the
 * inquiry id, so a client can never point a submission at another inquiry's
 * folder (or anywhere else in the bucket).
 */
export function isOwnArtworkPath(
  path: string,
  inquiryId: string,
  side: "front" | "back",
): boolean {
  if (!new RegExp(`^${UUID_RE}$`).test(inquiryId)) return false;
  const pattern = new RegExp(
    `^${inquiryId}/${side}/${UUID_RE}-[\\w.\\-]{1,${MAX_ARTWORK_NAME_LENGTH}}$`,
  );
  return pattern.test(path);
}
