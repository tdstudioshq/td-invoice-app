import type { FileCategory } from "@/lib/types/database";

// The three top-level categories every client's storage is organized into. The
// enum value (snake_case) maps to a hyphenated storage-path segment.
export const FILE_CATEGORIES: FileCategory[] = [
  "uploads",
  "final_files",
  "invoices",
];

export const STORAGE_PREFIX: Record<FileCategory, string> = {
  uploads: "uploads",
  final_files: "final-files",
  invoices: "invoices",
};

export const CATEGORY_LABEL: Record<FileCategory, string> = {
  uploads: "Uploads",
  final_files: "Final Files",
  invoices: "Invoices",
};

export const CATEGORY_DESCRIPTION: Record<FileCategory, string> = {
  uploads: "Files shared by or collected from the client.",
  final_files: "Completed deliverables ready for the client.",
  invoices: "Invoice documents and receipts.",
};

/**
 * Build the storage object key for a file: `{clientId}/{prefix}/{safeName}`.
 * The filename is sanitized and prefixed with a timestamp so re-uploading the
 * same name never collides (storage_path has a unique constraint).
 */
export function buildStoragePath(
  clientId: string,
  category: FileCategory,
  fileName: string,
): string {
  const safe = sanitizeFileName(fileName);
  return `${clientId}/${STORAGE_PREFIX[category]}/${Date.now()}-${safe}`;
}

/** Strip path separators and unusual characters from an uploaded filename. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 200) || "file";
}

/** Human-readable file size, e.g. 1536 -> "1.5 KB". */
export function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const value = n / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

/** Max upload size accepted by the portal (25 MB). Enforced in server actions. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
