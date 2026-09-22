import path from "node:path";

export const PREMADE_BUCKET = "premade-designs";
export const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const IGNORED_DIRECTORY_NAMES = new Set([
  "_pdf_output",
  "cutline-output",
  "cutlines",
  "output",
  "outputs",
  "supabase",
  "temp",
  "tmp",
]);

export interface CatalogImage {
  absolutePath: string;
  relativePath: string;
  normalizedRelativePath: string;
  originalFilename: string;
  normalizedFilename: string;
  collection: string;
  collectionName: string;
  contentHash: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  canonicalExtension: "jpg" | "png" | "webp";
  fileSize: number;
  width: number;
  height: number;
}

export interface UniqueLocalDesign {
  contentHash: string;
  canonical: CatalogImage;
  files: CatalogImage[];
  memberships: CatalogImage[];
}

export function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

export function isIgnoredDirectory(name: string): boolean {
  return isHiddenName(name) || IGNORED_DIRECTORY_NAMES.has(name.toLowerCase());
}

export function hasSupportedExtension(filename: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

export function mimeTypeForFormat(
  format: string | undefined,
): CatalogImage["mimeType"] | null {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return null;
}

export function canonicalExtensionForMime(
  mimeType: CatalogImage["mimeType"],
): CatalogImage["canonicalExtension"] {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

export function normalizeSegment(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, "-and-")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
}

export function normalizeCollection(relativeDirectory: string): string {
  const segments = relativeDirectory
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(normalizeSegment)
    .filter(Boolean);
  return segments.join("/") || "uncategorized";
}

export function normalizeFilename(
  filename: string,
  canonicalExtension?: CatalogImage["canonicalExtension"],
): string {
  const parsed = path.parse(filename);
  const stem = normalizeSegment(parsed.name) || "design";
  const extension = canonicalExtension ?? path.extname(filename).slice(1).toLowerCase();
  return extension ? `${stem}.${extension}` : stem;
}

export function normalizeRelativePath(
  relativePath: string,
  canonicalExtension?: CatalogImage["canonicalExtension"],
): string {
  const portable = relativePath.split(path.sep).join("/");
  const directory = path.posix.dirname(portable);
  const normalizedDirectory =
    directory === "." ? "" : normalizeCollection(directory);
  const filename = normalizeFilename(path.posix.basename(portable), canonicalExtension);
  return normalizedDirectory ? `${normalizedDirectory}/${filename}` : filename;
}

export function displayName(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function displayCollection(relativeDirectory: string): string {
  const portable = relativeDirectory.split(path.sep).join("/");
  return portable
    .split("/")
    .filter(Boolean)
    .map(displayName)
    .join(" / ") || "Uncategorized";
}

export function deterministicStoragePath(
  contentHash: string,
  extension: CatalogImage["canonicalExtension"],
): string {
  assertSha256(contentHash);
  return `objects/${contentHash.slice(0, 2)}/${contentHash}.${extension}`;
}

export function deterministicDesignSlug(name: string, contentHash: string): string {
  assertSha256(contentHash);
  const stem = normalizeSegment(name.replace(/\.[^.]+$/, "")) || "design";
  return `${stem}-${contentHash.slice(0, 12)}`;
}

export function assertSha256(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`Invalid SHA-256 value: ${value}`);
  }
}

export function groupLocalDesigns(images: CatalogImage[]): UniqueLocalDesign[] {
  const byHash = new Map<string, CatalogImage[]>();
  for (const image of images) {
    const group = byHash.get(image.contentHash) ?? [];
    group.push(image);
    byHash.set(image.contentHash, group);
  }

  return [...byHash.entries()]
    .map(([contentHash, files]) => {
      const sorted = [...files].sort((a, b) =>
        a.normalizedRelativePath.localeCompare(b.normalizedRelativePath),
      );
      const byCollection = new Map<string, CatalogImage>();
      for (const file of sorted) {
        if (!byCollection.has(file.collection)) {
          byCollection.set(file.collection, file);
        }
      }
      return {
        contentHash,
        canonical: sorted[0],
        files: sorted,
        memberships: [...byCollection.values()],
      };
    })
    .sort((a, b) =>
      a.canonical.normalizedRelativePath.localeCompare(
        b.canonical.normalizedRelativePath,
      ),
    );
}

export function duplicateFileCount(designs: UniqueLocalDesign[]): number {
  return designs.reduce(
    (count, design) => count + Math.max(0, design.files.length - 1),
    0,
  );
}

