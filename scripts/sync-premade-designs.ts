import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import {
  PREMADE_BUCKET,
  canonicalExtensionForMime,
  deterministicDesignSlug,
  deterministicStoragePath,
  displayCollection,
  displayName,
  duplicateFileCount,
  groupLocalDesigns,
  hasSupportedExtension,
  isHiddenName,
  isIgnoredDirectory,
  mimeTypeForFormat,
  normalizeCollection,
  normalizeFilename,
  normalizeRelativePath,
  type CatalogImage,
  type UniqueLocalDesign,
} from "./premade-sync/core";

const DEFAULT_SOURCE =
  "/Users/tdstudiosny/Desktop/PREMADE-DESIGNS-MASTER-FOLDER";
const REPORT_DIRECTORY = path.resolve(".premade-sync");
const REPORT_PATH = path.join(REPORT_DIRECTORY, "reconciliation-latest.json");
const PREFLIGHT_PATH = path.join(REPORT_DIRECTORY, "reconciliation-preflight.json");
const HASH_CACHE_PATH = path.join(REPORT_DIRECTORY, "remote-hashes.json");
const PAGE_SIZE = 1_000;

interface Options {
  source: string;
  dryRun: boolean;
  verifyStorage: boolean;
  useCache: boolean;
}

interface EnumeratedFile {
  absolutePath: string;
  relativePath: string;
  ignoredReason: string | null;
}

interface InvalidFile {
  relativePath: string;
  reason: string;
}

interface StorageObject {
  path: string;
  name: string;
  size: number;
  mimeType: string | null;
  etag: string | null;
  updatedAt: string | null;
}

interface RemoteHash {
  hash: string;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  verifiedFromBytes: boolean;
}

interface DatabaseDesign {
  id: string;
  name: string;
  slug: string;
  family: string;
  storage_bucket: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  size_bytes: number;
  sha256: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface DatabaseCollection {
  id: string;
  slug: string;
  name: string;
}

interface DatabaseMembership {
  design_id: string;
  collection_id: string;
  source_relative_path: string;
  normalized_relative_path: string;
  original_filename: string;
  normalized_filename: string;
  sort_order: number;
}

interface SyncDesignPayload {
  sha256: string;
  name: string;
  slug: string;
  family: string;
  storage_path: string;
  filename: string;
  mime_type: CatalogImage["mimeType"];
  width: number | null;
  height: number | null;
  size_bytes: number;
  sort_order: number;
}

interface SyncMembershipPayload {
  sha256: string;
  collection_slug: string;
  collection_name: string;
  source_relative_path: string;
  normalized_relative_path: string;
  original_filename: string;
  normalized_filename: string;
  sort_order: number;
}

interface UploadPlan {
  hash: string;
  storagePath: string;
  local: CatalogImage;
}

interface Reconciliation {
  generated_at: string;
  source: string;
  mode: "dry-run" | "preflight" | "post-sync";
  counts: Record<string, number>;
  verification: {
    storage_content_verification_requested: boolean;
    storage_objects_hashed_from_bytes: number;
    storage_objects_reused_from_database_hash: number;
    signed_url_check?: string;
  };
  anomalies: {
    blocking_conflicts: string[];
    storage_hash_mismatches: string[];
    invalid_files: InvalidFile[];
    local_duplicate_groups: Array<{
      content_hash: string;
      paths: string[];
    }>;
    local_duplicate_content_different_names: Array<{
      content_hash: string;
      paths: string[];
    }>;
    local_duplicate_content_different_collections: Array<{
      content_hash: string;
      paths: string[];
    }>;
    remote_duplicate_hash_groups: Array<{
      content_hash: string;
      paths: string[];
    }>;
    local_only_designs: string[];
    supabase_only_designs: string[];
    orphaned_storage_objects: string[];
    orphaned_database_rows: string[];
    proposed_uploads: Array<{
      content_hash: string;
      source: string;
      storage_path: string;
    }>;
    removed_exact_duplicate_objects: string[];
  };
}

interface ReconciliationState {
  report: Reconciliation;
  localDesigns: UniqueLocalDesign[];
  storageObjects: StorageObject[];
  remoteHashes: Map<string, RemoteHash>;
  databaseDesigns: DatabaseDesign[];
  designPayloads: SyncDesignPayload[];
  membershipPayloads: SyncMembershipPayload[];
  uploads: UploadPlan[];
  exactDuplicateObjectsToRemove: string[];
}

// This command intentionally talks to tables/RPCs introduced by the migration
// it manages. Keep the client untyped here; the application client remains
// backed by the hand-maintained Database mirror in lib/types/database.ts.
type LooseDatabase = {
  public: {
    Tables: Record<string, {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: [];
    }>;
    Views: Record<string, never>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
  };
};
type UntypedClient = SupabaseClient<LooseDatabase>;

function parseOptions(argv: string[]): Options {
  let source = process.env.PREMADE_DESIGNS_MASTER_FOLDER ?? DEFAULT_SOURCE;
  let dryRun = false;
  let verifyStorage = false;
  let useCache = true;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") dryRun = true;
    else if (argument === "--verify-storage") verifyStorage = true;
    else if (argument === "--no-cache") useCache = false;
    else if (argument === "--source") {
      source = argv[index + 1] ?? "";
      index += 1;
    } else if (argument.startsWith("--source=")) {
      source = argument.slice("--source=".length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!source) throw new Error("The premade designs source folder is required.");
  return { source: path.resolve(source), dryRun, verifyStorage, useCache };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function mapLimit<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

async function sha256File(filename: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function enumerateFiles(root: string): Promise<EnumeratedFile[]> {
  const files: EnumeratedFile[] = [];

  async function walk(
    directory: string,
    relativeDirectory: string,
    inheritedIgnore: string | null,
  ) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = relativeDirectory
        ? path.posix.join(relativeDirectory, entry.name)
        : entry.name;
      if (entry.isDirectory()) {
        const ignoredReason =
          inheritedIgnore ??
          (isIgnoredDirectory(entry.name)
            ? `ignored support/system directory: ${entry.name}`
            : null);
        await walk(absolutePath, relativePath, ignoredReason);
      } else if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath,
          ignoredReason:
            inheritedIgnore ??
            (isHiddenName(entry.name) ? "hidden/system file" : null),
        });
      }
    }
  }

  await walk(root, "", null);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function scanLocal(root: string): Promise<{
  allFiles: EnumeratedFile[];
  images: CatalogImage[];
  invalidFiles: InvalidFile[];
}> {
  const rootStats = await stat(root).catch(() => null);
  if (!rootStats?.isDirectory()) {
    throw new Error(`Master folder does not exist or is not a directory: ${root}`);
  }

  const allFiles = await enumerateFiles(root);
  const invalidFiles: InvalidFile[] = [];
  const candidates: EnumeratedFile[] = [];
  for (const file of allFiles) {
    if (file.ignoredReason) {
      invalidFiles.push({
        relativePath: file.relativePath,
        reason: file.ignoredReason,
      });
    } else if (!hasSupportedExtension(file.relativePath)) {
      invalidFiles.push({
        relativePath: file.relativePath,
        reason: "unsupported/non-image extension",
      });
    } else {
      candidates.push(file);
    }
  }

  let completed = 0;
  const scanned = await mapLimit(candidates, 8, async (file) => {
    try {
      const [metadata, contentHash, fileStats] = await Promise.all([
        sharp(file.absolutePath, { animated: true }).metadata(),
        sha256File(file.absolutePath),
        stat(file.absolutePath),
      ]);
      const mimeType = mimeTypeForFormat(metadata.format);
      if (!mimeType || !metadata.width || !metadata.height) {
        throw new Error(`unsupported or unreadable image format: ${metadata.format ?? "unknown"}`);
      }
      const canonicalExtension = canonicalExtensionForMime(mimeType);
      const originalFilename = path.posix.basename(file.relativePath);
      const portableDirectory = path.posix.dirname(file.relativePath);
      const sourceDirectory = portableDirectory === "." ? "" : portableDirectory;
      const image: CatalogImage = {
        absolutePath: file.absolutePath,
        relativePath: file.relativePath,
        normalizedRelativePath: normalizeRelativePath(
          file.relativePath,
          canonicalExtension,
        ),
        originalFilename,
        normalizedFilename: normalizeFilename(
          originalFilename,
          canonicalExtension,
        ),
        collection: normalizeCollection(sourceDirectory),
        collectionName: displayCollection(sourceDirectory),
        contentHash,
        mimeType,
        canonicalExtension,
        fileSize: fileStats.size,
        width: metadata.width,
        height: metadata.height,
      };
      return { image, invalid: null };
    } catch (error) {
      return {
        image: null,
        invalid: {
          relativePath: file.relativePath,
          reason: error instanceof Error ? error.message : String(error),
        },
      };
    } finally {
      completed += 1;
      if (completed % 250 === 0 || completed === candidates.length) {
        console.log(`Hashed and validated ${completed}/${candidates.length} local images`);
      }
    }
  });

  const images: CatalogImage[] = [];
  for (const result of scanned) {
    if (result.image) images.push(result.image);
    if (result.invalid) invalidFiles.push(result.invalid);
  }
  return {
    allFiles,
    images,
    invalidFiles: invalidFiles.sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    ),
  };
}

async function listStorageObjects(client: UntypedClient): Promise<StorageObject[]> {
  const objects: StorageObject[] = [];
  const queue = [""];
  const seenFolders = new Set(queue);

  while (queue.length > 0) {
    const prefix = queue.shift()!;
    let offset = 0;
    while (true) {
      const { data, error } = await client.storage.from(PREMADE_BUCKET).list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Storage list failed at ${prefix || "/"}: ${error.message}`);

      for (const item of data ?? []) {
        const objectPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.metadata && Number.isFinite(Number(item.metadata.size))) {
          if (hasSupportedExtension(item.name)) {
            objects.push({
              path: objectPath,
              name: item.name,
              size: Number(item.metadata.size),
              mimeType:
                typeof item.metadata.mimetype === "string"
                  ? item.metadata.mimetype
                  : null,
              etag:
                typeof item.metadata.eTag === "string"
                  ? item.metadata.eTag
                  : typeof item.metadata.etag === "string"
                    ? item.metadata.etag
                    : null,
              updatedAt:
                typeof item.updated_at === "string" ? item.updated_at : null,
            });
          }
        } else if (!seenFolders.has(objectPath)) {
          seenFolders.add(objectPath);
          queue.push(objectPath);
        }
      }

      if (!data || data.length < PAGE_SIZE) break;
      offset += data.length;
    }
  }

  return objects.sort((a, b) => a.path.localeCompare(b.path));
}

async function fetchAllRows<T>(
  client: UntypedClient,
  table: string,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      if (["42P01", "PGRST205"].includes(error.code)) return null;
      throw new Error(`Database read failed for ${table}: ${error.message}`);
    }
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadHashCache(): Promise<Record<string, RemoteHash>> {
  try {
    return JSON.parse(await readFile(HASH_CACHE_PATH, "utf8")) as Record<
      string,
      RemoteHash
    >;
  } catch {
    return {};
  }
}

function storageFingerprint(object: StorageObject): string {
  return [object.path, object.size, object.etag ?? "", object.updatedAt ?? ""].join(
    "\u0000",
  );
}

async function hashRemoteObjects(
  client: UntypedClient,
  objects: StorageObject[],
  databaseByPath: Map<string, DatabaseDesign>,
  options: Options,
): Promise<{
  hashes: Map<string, RemoteHash>;
  mismatches: string[];
  hashedFromBytes: number;
  reusedFromDatabase: number;
}> {
  const cache = options.useCache ? await loadHashCache() : {};
  const nextCache: Record<string, RemoteHash> = {};
  const hashes = new Map<string, RemoteHash>();
  const mismatches: string[] = [];
  let hashedFromBytes = 0;
  let reusedFromDatabase = 0;
  let completed = 0;

  async function downloadWithRetry(path: string): Promise<Blob> {
    let lastError = "empty response";
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const { data, error } = await client.storage.from(PREMADE_BUCKET).download(path);
      if (!error && data) return data;
      lastError = error?.message ?? "empty response";
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }
    throw new Error(`Could not download ${path} after 4 attempts: ${lastError}`);
  }

  await mapLimit(objects, 6, async (object) => {
    const database = databaseByPath.get(object.path);
    const fingerprint = storageFingerprint(object);
    let remoteHash: RemoteHash | null = null;

    if (options.verifyStorage && cache[fingerprint]) {
      remoteHash = { ...cache[fingerprint], verifiedFromBytes: true };
    } else if (!options.verifyStorage && database && database.size_bytes === object.size) {
      remoteHash = {
        hash: database.sha256.trim(),
        width: database.width,
        height: database.height,
        mimeType: database.mime_type,
        verifiedFromBytes: false,
      };
      reusedFromDatabase += 1;
    } else {
      const data = await downloadWithRetry(object.path);
      const buffer = Buffer.from(await data.arrayBuffer());
      const metadata = await sharp(buffer, { animated: true }).metadata();
      const mimeType = mimeTypeForFormat(metadata.format);
      remoteHash = {
        hash: sha256Buffer(buffer),
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        mimeType,
        verifiedFromBytes: true,
      };
      hashedFromBytes += 1;
    }

    if (database) {
      if (database.sha256.trim() !== remoteHash.hash) {
        mismatches.push(
          `${object.path}: database ${database.sha256.trim()} != Storage ${remoteHash.hash}`,
        );
      }
      if (database.size_bytes !== object.size) {
        mismatches.push(
          `${object.path}: database size ${database.size_bytes} != Storage size ${object.size}`,
        );
      }
    }

    hashes.set(object.path, remoteHash);
    if (remoteHash.verifiedFromBytes) nextCache[fingerprint] = remoteHash;
    completed += 1;
    if (
      (options.verifyStorage && completed % 100 === 0) ||
      completed === objects.length
    ) {
      console.log(`Reconciled ${completed}/${objects.length} Storage objects`);
    }
  });

  await mkdir(REPORT_DIRECTORY, { recursive: true });
  await writeFile(HASH_CACHE_PATH, `${JSON.stringify(nextCache, null, 2)}\n`);
  return {
    hashes,
    mismatches: mismatches.sort(),
    hashedFromBytes,
    reusedFromDatabase,
  };
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = groups.get(groupKey) ?? [];
    group.push(value);
    groups.set(groupKey, group);
  }
  return groups;
}

function safeCatalogMime(value: string | null): CatalogImage["mimeType"] | null {
  if (value === "image/jpeg" || value === "image/png" || value === "image/webp") {
    return value;
  }
  return null;
}

function membershipKey(hash: string, collection: string): string {
  return `${hash}\u0000${collection}`;
}

function addMembership(
  memberships: Map<string, SyncMembershipPayload>,
  membership: Omit<SyncMembershipPayload, "sort_order"> & { sort_order?: number },
  priority: "preserve" | "replace",
) {
  const key = membershipKey(membership.sha256, membership.collection_slug);
  if (priority === "preserve" && memberships.has(key)) return;
  memberships.set(key, { ...membership, sort_order: membership.sort_order ?? 0 });
}

function buildReconciliation(
  mode: Reconciliation["mode"],
  source: string,
  allLocalFiles: EnumeratedFile[],
  invalidFiles: InvalidFile[],
  localImages: CatalogImage[],
  localDesigns: UniqueLocalDesign[],
  storageObjects: StorageObject[],
  remoteHashes: Map<string, RemoteHash>,
  databaseDesigns: DatabaseDesign[],
  databaseCollections: DatabaseCollection[],
  databaseMemberships: DatabaseMembership[],
  storageHashMismatches: string[],
  verification: {
    requested: boolean;
    hashedFromBytes: number;
    reusedFromDatabase: number;
  },
): ReconciliationState {
  const blockingConflicts = [...storageHashMismatches];
  const localByHash = new Map(localDesigns.map((design) => [design.contentHash, design]));
  const databaseById = new Map(databaseDesigns.map((design) => [design.id, design]));
  const databaseByHashGroups = groupBy(databaseDesigns, (design) =>
    design.sha256.trim(),
  );
  const databaseByHash = new Map(
    [...databaseByHashGroups].map(([hash, rows]) => [hash, rows[0]]),
  );
  const databaseByPath = new Map(
    databaseDesigns.map((design) => [design.storage_path, design]),
  );
  const storageByPath = new Map(storageObjects.map((object) => [object.path, object]));
  const storageByLowerPath = groupBy(storageObjects, (object) =>
    object.path.toLowerCase(),
  );

  for (const [hash, rows] of databaseByHashGroups) {
    if (rows.length > 1) {
      blockingConflicts.push(`Database hash ${hash} has ${rows.length} rows.`);
    }
  }
  for (const [lowerPath, objects] of storageByLowerPath) {
    if (objects.length > 1) {
      blockingConflicts.push(
        `Storage has case-only path collision ${lowerPath}: ${objects.map((x) => x.path).join(", ")}`,
      );
    }
  }

  const normalizedLocalGroups = groupBy(localImages, (image) =>
    image.normalizedRelativePath,
  );
  for (const [normalizedPath, images] of normalizedLocalGroups) {
    const hashes = new Set(images.map((image) => image.contentHash));
    if (hashes.size > 1) {
      blockingConflicts.push(
        `Normalized local path ${normalizedPath} points to ${hashes.size} content hashes.`,
      );
    }
  }

  const collectionById = new Map(
    databaseCollections.map((collection) => [collection.id, collection]),
  );
  const memberships = new Map<string, SyncMembershipPayload>();
  const membershipPathOwners = new Map<string, string>();

  for (const existing of databaseMemberships) {
    const design = databaseById.get(existing.design_id);
    const collection = collectionById.get(existing.collection_id);
    if (!design || !collection) continue;
    const hash = design.sha256.trim();
    membershipPathOwners.set(existing.normalized_relative_path, hash);
    addMembership(
      memberships,
      {
        sha256: hash,
        collection_slug: collection.slug,
        collection_name: collection.name,
        source_relative_path: existing.source_relative_path,
        normalized_relative_path: existing.normalized_relative_path,
        original_filename: existing.original_filename,
        normalized_filename: existing.normalized_filename,
        sort_order: existing.sort_order,
      },
      "replace",
    );
  }

  for (const image of localImages) {
    const owner = membershipPathOwners.get(image.normalizedRelativePath);
    if (owner && owner !== image.contentHash) {
      blockingConflicts.push(
        `Normalized source path ${image.normalizedRelativePath} belongs to ${owner}, not ${image.contentHash}.`,
      );
    }
  }

  const remoteByHash = new Map<string, StorageObject[]>();
  for (const object of storageObjects) {
    const hash = remoteHashes.get(object.path)?.hash;
    if (!hash) {
      blockingConflicts.push(`Storage object ${object.path} has no SHA-256.`);
      continue;
    }
    const group = remoteByHash.get(hash) ?? [];
    group.push(object);
    remoteByHash.set(hash, group);
  }

  const remoteDuplicateGroups = [...remoteByHash]
    .filter(([, objects]) => objects.length > 1)
    .map(([content_hash, objects]) => ({
      content_hash,
      paths: objects.map((object) => object.path).sort(),
    }))
    .sort((a, b) => a.content_hash.localeCompare(b.content_hash));

  const exactDuplicateObjectsToRemove: string[] = [];
  for (const group of remoteDuplicateGroups) {
    const databasePath = databaseByHash.get(group.content_hash)?.storage_path;
    const canonical =
      (databasePath && group.paths.includes(databasePath) ? databasePath : null) ??
      group.paths[0];
    exactDuplicateObjectsToRemove.push(
      ...group.paths.filter((objectPath) => objectPath !== canonical),
    );
  }

  const storageOrphans = storageObjects
    .filter((object) => !databaseByPath.has(object.path))
    .map((object) => object.path)
    .sort();
  const databaseOrphans = databaseDesigns
    .filter((design) => !storageByPath.has(design.storage_path))
    .map((design) => design.storage_path)
    .sort();

  const allHashes = new Set([
    ...localByHash.keys(),
    ...remoteByHash.keys(),
    ...databaseByHash.keys(),
  ]);
  const designPayloads: SyncDesignPayload[] = [];
  const uploads: UploadPlan[] = [];

  for (const hash of [...allHashes].sort()) {
    const database = databaseByHash.get(hash);
    const local = localByHash.get(hash);
    const remoteObjects = remoteByHash.get(hash) ?? [];
    const databaseObject = database
      ? remoteObjects.find((object) => object.path === database.storage_path)
      : null;
    const remote = databaseObject ?? remoteObjects[0] ?? null;

    let payload: SyncDesignPayload;
    if (database) {
      const mimeType = safeCatalogMime(database.mime_type);
      if (!mimeType) {
        blockingConflicts.push(
          `Database design ${database.id} has unsupported MIME ${database.mime_type}.`,
        );
        continue;
      }
      payload = {
        sha256: hash,
        name: database.name,
        slug: database.slug,
        family: database.family,
        storage_path: database.storage_path,
        filename: database.filename,
        mime_type: mimeType,
        width: database.width,
        height: database.height,
        size_bytes: database.size_bytes,
        sort_order: database.sort_order,
      };
    } else if (remote) {
      const remoteMetadata = remoteHashes.get(remote.path)!;
      const localCanonical = local?.canonical;
      const mimeType =
        safeCatalogMime(remoteMetadata.mimeType) ??
        safeCatalogMime(remote.mimeType) ??
        localCanonical?.mimeType ??
        null;
      if (!mimeType) {
        blockingConflicts.push(`Storage object ${remote.path} has unsupported MIME.`);
        continue;
      }
      payload = {
        sha256: hash,
        name: displayName(remote.name),
        slug: deterministicDesignSlug(remote.name, hash),
        family: normalizeCollection(path.posix.dirname(remote.path)),
        storage_path: remote.path,
        filename: remote.name,
        mime_type: mimeType,
        width: remoteMetadata.width ?? localCanonical?.width ?? null,
        height: remoteMetadata.height ?? localCanonical?.height ?? null,
        size_bytes: remote.size,
        sort_order: 0,
      };
    } else if (local) {
      const canonical = local.canonical;
      payload = {
        sha256: hash,
        name: displayName(canonical.originalFilename),
        slug: deterministicDesignSlug(canonical.originalFilename, hash),
        family: canonical.collection,
        storage_path: deterministicStoragePath(hash, canonical.canonicalExtension),
        filename: canonical.originalFilename,
        mime_type: canonical.mimeType,
        width: canonical.width,
        height: canonical.height,
        size_bytes: canonical.fileSize,
        sort_order: 0,
      };
    } else {
      continue;
    }

    designPayloads.push(payload);

    if (!remote && local) {
      const occupied = storageByLowerPath.get(payload.storage_path.toLowerCase());
      if (occupied?.length) {
        const occupantHash = remoteHashes.get(occupied[0].path)?.hash;
        if (occupantHash !== hash) {
          blockingConflicts.push(
            `Upload path ${payload.storage_path} is occupied by different content ${occupantHash}.`,
          );
        }
      } else {
        uploads.push({
          hash,
          storagePath: payload.storage_path,
          local: local.canonical,
        });
      }
    }

    const hasExistingMembership = [...memberships.values()].some(
      (membership) => membership.sha256 === hash,
    );
    if (!hasExistingMembership && database) {
      const extension = canonicalExtensionForMime(payload.mime_type);
      addMembership(
        memberships,
        {
          sha256: hash,
          collection_slug: database.family,
          collection_name: displayCollection(database.family),
          source_relative_path: database.storage_path,
          normalized_relative_path: normalizeRelativePath(
            database.storage_path,
            extension,
          ),
          original_filename: database.filename,
          normalized_filename: normalizeFilename(database.filename, extension),
        },
        "preserve",
      );
    }

    for (const remoteObject of remoteObjects) {
      const remoteDirectory = path.posix.dirname(remoteObject.path);
      const sourceDirectory = remoteDirectory === "." ? "" : remoteDirectory;
      const collectionSlug = normalizeCollection(sourceDirectory);
      if (collectionSlug === "objects" || collectionSlug.startsWith("objects/")) {
        continue;
      }
      const extension = canonicalExtensionForMime(payload.mime_type);
      addMembership(
        memberships,
        {
          sha256: hash,
          collection_slug: collectionSlug,
          collection_name: displayCollection(sourceDirectory),
          source_relative_path: remoteObject.path,
          normalized_relative_path: normalizeRelativePath(
            remoteObject.path,
            extension,
          ),
          original_filename: remoteObject.name,
          normalized_filename: normalizeFilename(remoteObject.name, extension),
        },
        "preserve",
      );
    }

    for (const localMembership of local?.memberships ?? []) {
      addMembership(
        memberships,
        {
          sha256: hash,
          collection_slug: localMembership.collection,
          collection_name: localMembership.collectionName,
          source_relative_path: localMembership.relativePath,
          normalized_relative_path: localMembership.normalizedRelativePath,
          original_filename: localMembership.originalFilename,
          normalized_filename: localMembership.normalizedFilename,
        },
        "replace",
      );
    }
  }

  const membershipPayloads = [...memberships.values()];
  const byCollection = groupBy(
    membershipPayloads,
    (membership) => membership.collection_slug,
  );
  for (const collectionMemberships of byCollection.values()) {
    collectionMemberships
      .sort((a, b) =>
        a.normalized_relative_path.localeCompare(b.normalized_relative_path),
      )
      .forEach((membership, index) => {
        membership.sort_order = index + 1;
      });
  }
  membershipPayloads.sort(
    (a, b) =>
      a.collection_slug.localeCompare(b.collection_slug) ||
      a.sort_order - b.sort_order,
  );

  const normalizedMembershipGroups = groupBy(
    membershipPayloads,
    (membership) => membership.normalized_relative_path,
  );
  for (const [normalizedPath, rows] of normalizedMembershipGroups) {
    const hashes = new Set(rows.map((row) => row.sha256));
    if (hashes.size > 1) {
      blockingConflicts.push(
        `Membership path ${normalizedPath} maps to ${hashes.size} hashes.`,
      );
    }
  }

  const localDuplicates = localDesigns.filter((design) => design.files.length > 1);
  const duplicateDifferentNames = localDuplicates.filter(
    (design) =>
      new Set(design.files.map((file) => file.normalizedFilename)).size > 1,
  );
  const duplicateDifferentCollections = localDuplicates.filter(
    (design) => new Set(design.files.map((file) => file.collection)).size > 1,
  );
  const localOnlyHashes = [...localByHash.keys()]
    .filter((hash) => !remoteByHash.has(hash))
    .sort();
  const supabaseOnlyHashes = [...remoteByHash.keys()]
    .filter((hash) => !localByHash.has(hash))
    .sort();
  const remoteDuplicateFileCount = remoteDuplicateGroups.reduce(
    (count, group) => count + group.paths.length - 1,
    0,
  );

  const report: Reconciliation = {
    generated_at: new Date().toISOString(),
    source,
    mode,
    counts: {
      total_local_files: allLocalFiles.length,
      valid_local_images: localImages.length,
      unique_local_image_hashes: localDesigns.length,
      duplicate_local_hash_groups: localDuplicates.length,
      duplicate_local_files: duplicateFileCount(localDesigns),
      invalid_or_ignored_local_files: invalidFiles.length,
      existing_supabase_objects: storageObjects.length,
      unique_supabase_content_hashes: remoteByHash.size,
      duplicate_supabase_hash_groups: remoteDuplicateGroups.length,
      duplicate_supabase_objects: remoteDuplicateFileCount,
      missing_local_to_supabase_designs: localOnlyHashes.length,
      supabase_only_designs: supabaseOnlyHashes.length,
      database_rows: databaseDesigns.length,
      orphaned_storage_objects: storageOrphans.length,
      orphaned_database_rows: databaseOrphans.length,
      conflicting_paths: new Set(blockingConflicts).size,
      proposed_uploads: uploads.length,
      skipped_already_present_unique_designs:
        localDesigns.length - localOnlyHashes.length,
      proposed_catalog_design_rows: designPayloads.length,
      proposed_catalog_memberships: membershipPayloads.length,
      proposed_collections: new Set(
        membershipPayloads.map((membership) => membership.collection_slug),
      ).size,
    },
    verification: {
      storage_content_verification_requested: verification.requested,
      storage_objects_hashed_from_bytes: verification.hashedFromBytes,
      storage_objects_reused_from_database_hash: verification.reusedFromDatabase,
    },
    anomalies: {
      blocking_conflicts: [...new Set(blockingConflicts)].sort(),
      storage_hash_mismatches: storageHashMismatches,
      invalid_files: invalidFiles,
      local_duplicate_groups: localDuplicates.map((design) => ({
        content_hash: design.contentHash,
        paths: design.files.map((file) => file.relativePath),
      })),
      local_duplicate_content_different_names: duplicateDifferentNames.map(
        (design) => ({
          content_hash: design.contentHash,
          paths: design.files.map((file) => file.relativePath),
        }),
      ),
      local_duplicate_content_different_collections:
        duplicateDifferentCollections.map((design) => ({
          content_hash: design.contentHash,
          paths: design.files.map((file) => file.relativePath),
        })),
      remote_duplicate_hash_groups: remoteDuplicateGroups,
      local_only_designs: localOnlyHashes,
      supabase_only_designs: supabaseOnlyHashes,
      orphaned_storage_objects: storageOrphans,
      orphaned_database_rows: databaseOrphans,
      proposed_uploads: uploads.map((upload) => ({
        content_hash: upload.hash,
        source: upload.local.relativePath,
        storage_path: upload.storagePath,
      })),
      removed_exact_duplicate_objects: [],
    },
  };

  return {
    report,
    localDesigns,
    storageObjects,
    remoteHashes,
    databaseDesigns,
    designPayloads,
    membershipPayloads,
    uploads,
    exactDuplicateObjectsToRemove: exactDuplicateObjectsToRemove.sort(),
  };
}

async function reconcile(
  client: UntypedClient,
  options: Options,
  mode: Reconciliation["mode"],
): Promise<ReconciliationState> {
  console.log(`Scanning local master folder: ${options.source}`);
  const local = await scanLocal(options.source);
  const localDesigns = groupLocalDesigns(local.images);

  console.log("Reading the database manifest and private Storage bucket");
  const [storageObjects, databaseDesigns, databaseCollections, databaseMemberships] =
    await Promise.all([
      listStorageObjects(client),
      fetchAllRows<DatabaseDesign>(client, "premade_designs"),
      fetchAllRows<DatabaseCollection>(client, "premade_collections"),
      fetchAllRows<DatabaseMembership>(client, "premade_design_collections"),
    ]);
  if (!databaseDesigns) {
    throw new Error(
      "public.premade_designs is missing. Apply the catalog migration before syncing.",
    );
  }
  databaseDesigns.forEach((row) => {
    row.sha256 = row.sha256.trim();
  });
  const databaseByPath = new Map(
    databaseDesigns.map((design) => [design.storage_path, design]),
  );
  const remote = await hashRemoteObjects(
    client,
    storageObjects,
    databaseByPath,
    options,
  );

  return buildReconciliation(
    mode,
    options.source,
    local.allFiles,
    local.invalidFiles,
    local.images,
    localDesigns,
    storageObjects,
    remote.hashes,
    databaseDesigns,
    databaseCollections ?? [],
    databaseMemberships ?? [],
    remote.mismatches,
    {
      requested: options.verifyStorage,
      hashedFromBytes: remote.hashedFromBytes,
      reusedFromDatabase: remote.reusedFromDatabase,
    },
  );
}

async function writeReport(report: Reconciliation, filename: string) {
  await mkdir(REPORT_DIRECTORY, { recursive: true });
  await writeFile(filename, `${JSON.stringify(report, null, 2)}\n`);
}

function printSummary(report: Reconciliation) {
  const counts = report.counts;
  console.log("");
  console.log(`Premade Designs reconciliation (${report.mode})`);
  for (const [label, value] of Object.entries(counts)) {
    console.log(`${label}: ${value.toLocaleString()}`);
  }
  console.log(
    `blocking_conflicts: ${report.anomalies.blocking_conflicts.length.toLocaleString()}`,
  );
  console.log("");
}

async function uploadMissingDesigns(
  client: UntypedClient,
  uploads: UploadPlan[],
): Promise<number> {
  let uploaded = 0;
  await mapLimit(uploads, 4, async (upload, index) => {
    const bytes = await readFile(upload.local.absolutePath);
    const { error } = await client.storage.from(PREMADE_BUCKET).upload(
      upload.storagePath,
      bytes,
      {
        contentType: upload.local.mimeType,
        cacheControl: "31536000",
        upsert: false,
      },
    );
    if (error) {
      if (/already exists|duplicate/i.test(error.message)) {
        const { data, error: downloadError } = await client.storage
          .from(PREMADE_BUCKET)
          .download(upload.storagePath);
        if (downloadError || !data) {
          throw new Error(
            `Upload raced for ${upload.storagePath}, then verification failed: ${downloadError?.message ?? "empty response"}`,
          );
        }
        const actualHash = sha256Buffer(Buffer.from(await data.arrayBuffer()));
        if (actualHash !== upload.hash) {
          throw new Error(
            `Upload path ${upload.storagePath} already exists with different content.`,
          );
        }
      } else {
        throw new Error(`Upload failed for ${upload.local.relativePath}: ${error.message}`);
      }
    } else {
      uploaded += 1;
    }
    console.log(
      `Uploaded/reconciled ${index + 1}/${uploads.length}: ${upload.local.relativePath}`,
    );
  });
  return uploaded;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function syncDatabaseCatalog(
  client: UntypedClient,
  designs: SyncDesignPayload[],
  memberships: SyncMembershipPayload[],
) {
  let completed = 0;
  const designChunks = chunks(designs, 250);
  for (const batch of designChunks) {
    const { error } = await client.rpc("sync_premade_catalog", {
      p_designs: batch,
      p_memberships: [],
    });
    if (error) throw new Error(`Catalog design upsert failed: ${error.message}`);
    completed += batch.length;
    console.log(`Applied ${completed}/${designs.length} unique design records`);
  }

  completed = 0;
  const membershipChunks = chunks(memberships, 250);
  for (const batch of membershipChunks) {
    const { error } = await client.rpc("sync_premade_catalog", {
      p_designs: [],
      p_memberships: batch,
    });
    if (error) throw new Error(`Catalog membership upsert failed: ${error.message}`);
    completed += batch.length;
    console.log(`Applied ${completed}/${memberships.length} collection memberships`);
  }
}

async function removeVerifiedExactDuplicates(
  client: UntypedClient,
  paths: string[],
): Promise<string[]> {
  const removed: string[] = [];
  for (const objectPath of paths) {
    const { error } = await client.storage.from(PREMADE_BUCKET).remove([objectPath]);
    if (error) {
      throw new Error(`Could not remove verified exact duplicate ${objectPath}: ${error.message}`);
    }
    removed.push(objectPath);
    console.log(`Removed verified exact duplicate object: ${objectPath}`);
  }
  return removed;
}

async function verifyCatalogManifest(
  client: UntypedClient,
): Promise<{ uniqueDesigns: number; memberships: number; signedUrlCheck: string }> {
  const { data, error } = await client.rpc("list_premade_design_catalog");
  if (error) throw new Error(`Catalog manifest verification failed: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("Catalog manifest did not return an array.");
  const manifestEntries = data as Array<Record<string, unknown>>;

  const uniqueHashes = new Set<string>();
  const relationshipKeys = new Set<string>();
  for (const raw of manifestEntries) {
    if (!raw || typeof raw !== "object") {
      throw new Error("Catalog manifest contains a non-object entry.");
    }
    const entry = raw as Record<string, unknown>;
    const contentHash = String(entry.content_hash ?? "");
    const collection = String(entry.collection ?? "");
    const relationshipKey = `${contentHash}\u0000${collection}`;
    if (relationshipKeys.has(relationshipKey)) {
      throw new Error(
        `Catalog manifest contains a duplicate card for ${contentHash} in ${collection}.`,
      );
    }
    relationshipKeys.add(relationshipKey);
    uniqueHashes.add(contentHash);
  }

  const first = manifestEntries[0];
  const firstPath = typeof first?.path === "string" ? first.path : null;
  let signedUrlCheck = "not-run-empty-manifest";
  if (firstPath) {
    const { data: signed, error: signedError } = await client.storage
      .from(PREMADE_BUCKET)
      .createSignedUrl(firstPath, 60);
    if (signedError || !signed?.signedUrl) {
      throw new Error(`Signed URL creation failed: ${signedError?.message ?? "empty URL"}`);
    }
    const response = await fetch(signed.signedUrl, {
      headers: { Range: "bytes=0-31" },
    });
    if (![200, 206].includes(response.status)) {
      throw new Error(`Signed image fetch returned HTTP ${response.status}.`);
    }
    signedUrlCheck = `ok-http-${response.status}`;
  }

  return {
    uniqueDesigns: uniqueHashes.size,
    memberships: relationshipKeys.size,
    signedUrlCheck,
  };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const client = createClient(
    requiredEnvironment("SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as unknown as UntypedClient;

  const preflight = await reconcile(
    client,
    options,
    options.dryRun ? "dry-run" : "preflight",
  );
  await writeReport(preflight.report, options.dryRun ? REPORT_PATH : PREFLIGHT_PATH);
  printSummary(preflight.report);

  if (preflight.report.anomalies.blocking_conflicts.length > 0) {
    throw new Error(
      `Sync stopped before uploads because ${preflight.report.anomalies.blocking_conflicts.length} blocking conflict(s) require review.`,
    );
  }
  if (options.dryRun) {
    console.log(`Dry-run report: ${REPORT_PATH}`);
    return;
  }

  const uploaded = await uploadMissingDesigns(client, preflight.uploads);
  await syncDatabaseCatalog(
    client,
    preflight.designPayloads,
    preflight.membershipPayloads,
  );
  const removed = await removeVerifiedExactDuplicates(
    client,
    preflight.exactDuplicateObjectsToRemove,
  );

  const postflightOptions = { ...options, verifyStorage: false };
  const postflight = await reconcile(client, postflightOptions, "post-sync");
  postflight.report.counts.uploaded_this_run = uploaded;
  postflight.report.counts.removed_exact_duplicate_objects = removed.length;
  postflight.report.anomalies.removed_exact_duplicate_objects = removed;
  const manifest = await verifyCatalogManifest(client);
  postflight.report.counts.final_unique_catalog_designs = manifest.uniqueDesigns;
  postflight.report.counts.final_catalog_memberships = manifest.memberships;
  postflight.report.verification.signed_url_check = manifest.signedUrlCheck;
  await writeReport(postflight.report, REPORT_PATH);
  printSummary(postflight.report);

  if (
    postflight.report.counts.proposed_uploads !== 0 ||
    postflight.report.counts.duplicate_supabase_objects !== 0 ||
    postflight.report.counts.orphaned_storage_objects !== 0 ||
    postflight.report.counts.orphaned_database_rows !== 0
  ) {
    throw new Error("Post-sync reconciliation did not converge cleanly.");
  }

  console.log(`Final reconciliation report: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
