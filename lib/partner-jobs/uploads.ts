/**
 * Upload rules for print-partner job reference files.
 *
 * Server- and client-safe (no `fs`, no Supabase, no `server-only`), mirroring
 * lib/uploads.ts and lib/mylar-printing/artwork.ts so the browser rejects
 * exactly what the server would.
 *
 * This is a THIRD allowlist on purpose, and the reason is the same one that
 * split the mylar list off from the portal list: widening either existing list
 * to suit this form would quietly widen what admins, portal clients or public
 * visitors may upload. Partners send press-ready sources, so this list carries
 * .ai/.eps/.psd but no .zip or .gif.
 *
 * Where the limits are actually enforced:
 *   1. Client pre-check (UX only — bypassable).
 *   2. createPartnerJobUploadTicketsAction — nothing uploads without a
 *      server-minted signed-URL ticket, and tickets are only issued for
 *      allowlisted extensions within MAX_PARTNER_UPLOAD_BYTES, at paths the
 *      server builds.
 *   3. The `partner-job-files` bucket's file_size_limit (50 MB, migration
 *      20260825120000) — the authoritative byte cap Storage applies.
 *   4. Storage RLS: the object key's first segment must be the caller's own
 *      company id (see the bucket policies in the same migration).
 *   5. submitPartnerJobAction re-reads every object with storage.info() before
 *      its path is written to design_job_files.
 */

export const ALLOWED_PARTNER_UPLOAD_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "ai",
  "eps",
  "svg",
  "psd",
] as const;

export type AllowedPartnerUploadExtension =
  (typeof ALLOWED_PARTNER_UPLOAD_EXTENSIONS)[number];

/** Canonical Content-Type sent with the storage PUT for each extension. */
export const PARTNER_EXTENSION_MIME: Record<
  AllowedPartnerUploadExtension,
  string
> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  ai: "application/pdf",
  eps: "application/postscript",
  svg: "image/svg+xml",
  psd: "image/vnd.adobe.photoshop",
};

/**
 * Reported MIME types tolerated per extension, beyond the canonical one.
 * Browsers report design formats as octet-stream (or nothing) constantly, so a
 * missing/octet-stream type is always accepted; only a type that actively
 * contradicts the extension is rejected. The browser's value is advisory — the
 * extension allowlist plus the post-upload storage.info() check are the gate.
 */
const ACCEPTED_PARTNER_MIME: Record<
  AllowedPartnerUploadExtension,
  readonly string[]
> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
  ai: ["application/pdf", "application/postscript", "application/illustrator"],
  eps: ["application/postscript", "application/eps", "image/x-eps"],
  svg: ["image/svg+xml"],
  psd: [
    "image/vnd.adobe.photoshop",
    "application/x-photoshop",
    "application/photoshop",
    "application/psd",
    "image/psd",
  ],
};

/**
 * Sources the BROWSER converts to JPEG before anything else looks at them
 * (lib/partner-jobs/image-convert.ts).
 *
 * Deliberately NOT in ALLOWED_PARTNER_UPLOAD_EXTENSIONS. These are the two
 * formats a rep on an iPhone actually ends up holding — HEIC is the iOS camera
 * default and TIFF is what iMessage hands over for a pasted image — and both
 * are useless to a press. Listing them here makes the OS picker OFFER them;
 * conversion then runs before validatePartnerUploadFile(), so what reaches the
 * validator, the ticket and the bucket is always a .jpg. Widening `accept`
 * widens what can be CHOSEN, never what can be STORED.
 */
export const CONVERTIBLE_TO_JPEG_EXTENSIONS = [
  "heic",
  "heif",
  "tif",
  "tiff",
] as const;

/** What a browser reports for those, so the picker matches on iOS too. */
const CONVERTIBLE_TO_JPEG_MIME = [
  "image/heic",
  "image/heif",
  "image/tiff",
] as const;

/**
 * For <input type="file" accept={...}>.
 *
 * BOTH the extensions and their MIME types, and the MIME half is NOT
 * redundant: iOS matches an accept list against UTIs, never against filename
 * extensions, so an extension-only list leaves the Photos picker with nothing
 * it can match and a rep on an iPhone cannot select their artwork at all.
 * Listing `image/jpeg` / `image/png` is also what makes iOS transcode a HEIC
 * shot to JPEG on the way in, rather than handing over the .heic that
 * validatePartnerUploadFile() would then refuse. `accept` is a union, so the
 * extension half still covers desktop and the design formats browsers report
 * no type for. Widening this does NOT widen what is accepted — the allowlist
 * above is still the gate.
 */
export const PARTNER_ACCEPT_ATTRIBUTE = [
  ...ALLOWED_PARTNER_UPLOAD_EXTENSIONS.map((ext) => `.${ext}`),
  ...new Set(Object.values(PARTNER_EXTENSION_MIME)),
  ...CONVERTIBLE_TO_JPEG_EXTENSIONS.map((ext) => `.${ext}`),
  ...CONVERTIBLE_TO_JPEG_MIME,
].join(",");

export const PARTNER_TYPES_LABEL = "JPG, PNG, WEBP, PDF, AI, EPS, SVG, PSD";

/**
 * 50 MB, matching the mylar-artwork bucket rather than the 25 MB used by
 * client-files: these are production print sources. Safe because bytes go
 * browser -> Storage over a signed upload URL and never through a Server
 * Action. Keep in sync with the bucket's file_size_limit in migration
 * 20260825120000.
 */
export const MAX_PARTNER_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Longest original filename accepted, before sanitizing. */
export const MAX_PARTNER_FILENAME_LENGTH = 200;

export function partnerExtensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isAllowedPartnerExtension(
  ext: string,
): ext is AllowedPartnerUploadExtension {
  return (ALLOWED_PARTNER_UPLOAD_EXTENSIONS as readonly string[]).includes(ext);
}

/** Human-readable file size, e.g. 1536 -> "1.5 KB". Mirrors lib/portal.ts. */
export function formatPartnerBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const value = n / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

/** The Content-Type the storage object should carry for this file. */
export function resolvePartnerContentType(
  name: string,
  reported?: string | null,
): string {
  const ext = partnerExtensionOf(name);
  if (isAllowedPartnerExtension(ext)) return PARTNER_EXTENSION_MIME[ext];
  return reported || "application/octet-stream";
}

/**
 * Validate a candidate file by name, size and (advisory) reported MIME.
 * Returns a human-readable error, or null when acceptable.
 */
export function validatePartnerUploadFile(
  name: string,
  size: number,
  type?: string | null,
): string | null {
  if (!name || name.length > MAX_PARTNER_FILENAME_LENGTH) {
    return "That filename is too long. Rename the file and try again.";
  }
  const ext = partnerExtensionOf(name);
  if (!isAllowedPartnerExtension(ext)) {
    return `${ext ? `.${ext} files` : "That file type"} can't be attached. Upload ${PARTNER_TYPES_LABEL}.`;
  }
  if (size <= 0) return "That file is empty.";
  if (size > MAX_PARTNER_UPLOAD_BYTES) {
    return `That file is ${formatPartnerBytes(size)} — the limit is ${formatPartnerBytes(MAX_PARTNER_UPLOAD_BYTES)}.`;
  }
  const reported = (type ?? "").toLowerCase().trim();
  if (
    reported &&
    reported !== "application/octet-stream" &&
    !ACCEPTED_PARTNER_MIME[ext].includes(reported)
  ) {
    return `That file says it's ${reported}, which doesn't match its .${ext} extension.`;
  }
  return null;
}

/**
 * Whether this file can be shown as an `<img>` thumbnail. Raster only — the
 * same line `previewKind()` draws, and for the same reasons: an inline SVG can
 * carry script, and AI/PSD/EPS have nothing a browser can render. Mirrors
 * `isPreviewableArtwork()` in the mylar wizard.
 */
export function isPreviewableImage(name: string): boolean {
  const ext = partnerExtensionOf(name);
  return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp";
}

/**
 * Strip directories and unusual characters from an uploaded filename. Path
 * separators go first, so `../` can never survive; everything outside
 * [A-Za-z0-9_.-] then collapses to `_`.
 */
export function sanitizePartnerFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return (
    base.replace(/[^\w.\-]+/g, "_").slice(0, MAX_PARTNER_FILENAME_LENGTH) ||
    "file"
  );
}

/**
 * Build the object key for one reference file:
 *   {companyId}/{jobId}/{objectId}-{sanitized-name}
 *
 * The FIRST segment is the company id, which is exactly what the bucket's RLS
 * policies match on — so Storage itself refuses a write outside the caller's
 * own company, independently of anything this application checks. The second is
 * the job uuid minted before upload and reused as the design_jobs primary key,
 * so an object can only ever be claimed by the submission it was uploaded for.
 */
export function buildPartnerJobFilePath(
  companyId: string,
  jobId: string,
  objectId: string,
  fileName: string,
): string {
  return `${companyId}/${jobId}/${objectId}-${sanitizePartnerFileName(fileName)}`;
}

const UUID_RE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Whether `path` is a key this company + job could legitimately own. Used
 * server-side before an uploaded object is claimed by a submission, so a client
 * can never point a job at another company's folder — or anywhere else in the
 * bucket. Built from ids the server has already validated as uuids.
 */
export function isOwnPartnerJobFilePath(
  path: string,
  companyId: string,
  jobId: string,
): boolean {
  const uuidOnly = new RegExp(`^${UUID_RE}$`);
  if (!uuidOnly.test(companyId) || !uuidOnly.test(jobId)) return false;
  return new RegExp(
    `^${companyId}/${jobId}/${UUID_RE}-[\\w.\\-]{1,${MAX_PARTNER_FILENAME_LENGTH}}$`,
  ).test(path);
}
