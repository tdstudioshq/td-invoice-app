// Upload validation shared by the admin multi-file upload UI and its server
// actions (safe to import from both, like lib/cutline/limits.ts).
//
// Where the limits are actually enforced:
//   1. Client pre-check (UX only — bypassable).
//   2. createUploadTicketsAction — nothing uploads without a server-minted
//      signed-URL ticket, and tickets are only issued for allowlisted
//      extensions and sizes within MAX_UPLOAD_BYTES.
//   3. The client-files bucket's file_size_limit (25 MB, migration 0016) —
//      the authoritative byte cap applied by Storage to the actual body.
//   4. finalizeUploadAction re-checks the stored object via storage.info()
//      before any client_files row is written.
// Files upload straight from the browser to Supabase Storage, so file bytes
// never pass through a Server Action (Next caps those bodies at ~4 MB here,
// and Vercel at ~4.5 MB).

import { MAX_UPLOAD_BYTES, formatBytes } from "@/lib/portal";

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "pdf",
  "ai",
  "psd",
  "eps",
  "zip",
] as const;

export type AllowedUploadExtension = (typeof ALLOWED_UPLOAD_EXTENSIONS)[number];

// Canonical Content-Type sent with the storage PUT for each extension.
export const EXTENSION_MIME: Record<AllowedUploadExtension, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  ai: "application/pdf",
  psd: "image/vnd.adobe.photoshop",
  eps: "application/postscript",
  zip: "application/zip",
};

// Reported MIME types tolerated per extension, beyond the canonical one.
// Browsers commonly report design formats as octet-stream or nothing at all,
// so a missing/octet-stream type is always accepted; we only reject a type
// that contradicts the extension (e.g. a .png reported as text/html).
const ACCEPTED_MIME_BY_EXTENSION: Record<
  AllowedUploadExtension,
  readonly string[]
> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  svg: ["image/svg+xml"],
  pdf: ["application/pdf"],
  ai: ["application/pdf", "application/postscript", "application/illustrator"],
  psd: [
    "image/vnd.adobe.photoshop",
    "application/x-photoshop",
    "application/photoshop",
    "application/psd",
    "image/psd",
  ],
  eps: ["application/postscript", "application/eps", "image/x-eps"],
  zip: ["application/zip", "application/x-zip-compressed", "multipart/x-zip"],
};

// For <input type="file" accept={...}>.
export const ACCEPT_ATTRIBUTE = ALLOWED_UPLOAD_EXTENSIONS.map(
  (ext) => `.${ext}`,
).join(",");

export const ALLOWED_TYPES_LABEL =
  "PNG, JPG, WEBP, GIF, SVG, PDF, AI, PSD, EPS, ZIP";

export const MAX_BATCH_FILES = 20;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function isAllowedExtension(ext: string): ext is AllowedUploadExtension {
  return (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext);
}

/** The Content-Type the storage object should carry for this file. */
export function resolveUploadContentType(
  name: string,
  reported?: string | null,
): string {
  const ext = extensionOf(name);
  if (isAllowedExtension(ext)) return EXTENSION_MIME[ext];
  return reported || "application/octet-stream";
}

/**
 * Validate a candidate upload by name, size, and (advisory) reported MIME.
 * Returns a human-readable error, or null when the file is acceptable.
 */
export function validateUploadFile(
  name: string,
  size: number,
  type?: string | null,
): string | null {
  const ext = extensionOf(name);
  if (!isAllowedExtension(ext)) {
    return `File type ${ext ? `.${ext}` : "(none)"} is not allowed. Allowed: ${ALLOWED_TYPES_LABEL}.`;
  }
  if (size <= 0) {
    return "File is empty.";
  }
  if (size > MAX_UPLOAD_BYTES) {
    return `File exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`;
  }
  const reported = (type ?? "").toLowerCase().trim();
  if (
    reported &&
    reported !== "application/octet-stream" &&
    !ACCEPTED_MIME_BY_EXTENSION[ext].includes(reported)
  ) {
    return `File content type (${reported}) does not match its .${ext} extension.`;
  }
  return null;
}
