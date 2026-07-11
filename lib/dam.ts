import type { ClientFile } from "@/lib/types/database";

/**
 * Domain model for the portal's Drive-style file browser. Server- and
 * client-safe: pure functions over `client_files` rows, no Supabase imports.
 */

export type FileKind =
  | "image"
  | "vector"
  | "pdf"
  | "design"
  | "archive"
  | "other";

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  image: "Image",
  vector: "Vector (SVG)",
  pdf: "PDF",
  design: "Design source",
  archive: "Archive",
  other: "File",
};

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Classify a file for icon/preview purposes from MIME + extension. */
export function fileKind(file: Pick<ClientFile, "name" | "mime_type">): FileKind {
  const mime = (file.mime_type ?? "").toLowerCase().split(";")[0].trim();
  const ext = extension(file.name);
  if (mime === "image/svg+xml" || ext === "svg") return "vector";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (["ai", "psd", "eps", "indd", "fig", "sketch"].includes(ext))
    return "design";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  return "other";
}

/** Whether the browser can render a large thumbnail for this file. */
export function hasThumbnail(
  file: Pick<ClientFile, "name" | "mime_type">,
): boolean {
  return fileKind(file) === "image";
}

/**
 * Version grouping. Designers ship revisions as name variants —
 * `logo-v2.png`, `logo (3).png`, `logo_final_FINAL.png` — so files collapse
 * into one entry per normalized base name (per category), newest first. The
 * newest file is the visible card; older ones surface as "Version history" in
 * the preview panel. Heuristic only: distinct names are distinct files.
 */
export function versionKey(file: Pick<ClientFile, "name" | "category">): string {
  const base = file.name
    .toLowerCase()
    .replace(/\.[^.]+$/, "") // extension
    .replace(/[\s_\-.]*(v|ver|version)[\s_\-.]*\d+/g, "") // v2 / version 3
    .replace(/\(\d+\)/g, "") // (1)
    .replace(/[\s_\-.]*(final|latest|new|copy|updated)+/g, "") // final_FINAL
    .replace(/[\s_\-.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const ext = extension(file.name);
  return `${file.category}/${base || file.name.toLowerCase()}.${ext}`;
}

export interface FileVersionGroup {
  /** Newest file — the one shown in the grid/list. */
  latest: ClientFile;
  /** Older revisions, newest first. Empty for single-version files. */
  older: ClientFile[];
}

/** Collapse files (assumed sorted newest-first) into version groups. */
export function groupVersions(files: ClientFile[]): FileVersionGroup[] {
  const groups = new Map<string, FileVersionGroup>();
  const ordered: FileVersionGroup[] = [];
  for (const file of files) {
    const key = versionKey(file);
    const existing = groups.get(key);
    if (existing) {
      existing.older.push(file);
    } else {
      const group: FileVersionGroup = { latest: file, older: [] };
      groups.set(key, group);
      ordered.push(group);
    }
  }
  return ordered;
}

export type SortKey = "newest" | "oldest" | "name" | "size";

export const SORT_LABEL: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name A–Z",
  size: "Largest first",
};

export function sortFiles(files: ClientFile[], sort: SortKey): ClientFile[] {
  const sorted = [...files];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "oldest":
      return sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case "name":
      return sorted.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
    case "size":
      return sorted.sort((a, b) => b.size_bytes - a.size_bytes);
  }
}

/** Case-insensitive multi-term search over name + type. */
export function searchFiles<T extends Pick<ClientFile, "name" | "mime_type">>(
  files: T[],
  query: string,
): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return files;
  return files.filter((file) => {
    const haystack =
      `${file.name} ${file.mime_type ?? ""} ${FILE_KIND_LABEL[fileKind(file)]}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Human label for an activity-log action. */
export const ACTIVITY_LABEL: Record<string, string> = {
  upload: "uploaded",
  download: "downloaded",
  preview: "previewed",
  delete: "deleted",
  rename: "renamed",
};
