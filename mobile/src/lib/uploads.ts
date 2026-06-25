import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "@/src/lib/supabase";
import type { FileCategory } from "@/src/types/database";

const BUCKET = "client-files";

export const FILE_CATEGORIES: FileCategory[] = [
  "uploads",
  "final_files",
  "invoices",
];

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  uploads: "Uploads",
  final_files: "Final files",
  invoices: "Invoice files",
};

const STORAGE_PREFIX: Record<FileCategory, string> = {
  uploads: "uploads",
  final_files: "final-files",
  invoices: "invoices",
};

/** Max upload size accepted by the portal (25 MB) — mirrors web lib/portal.ts. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Allowed types. Validated by MIME first, falling back to file extension, so a
// picker that omits the MIME type (or reports HEIC as image/heif) still passes.
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);
const ALLOWED_EXT = new Set(["pdf", "jpg", "jpeg", "png", "heic", "heif"]);
const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
};

export const ALLOWED_TYPES_LABEL = "PDF, JPG, PNG, HEIC";

/** A file chosen from the camera, photo library, or document picker. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  /** True for image sources, so the UI can show a thumbnail preview. */
  isImage: boolean;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Strip path separators and unusual characters — mirrors web sanitizeFileName. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 200) || "file";
}

/**
 * Storage object key `{clientId}/{category}/{timestamp}-{safeName}` — identical
 * to the web `buildStoragePath`. The timestamp prefix + the `storage_path`
 * unique constraint + `x-upsert: false` make overwrites impossible.
 */
function buildUploadPath(
  clientId: string,
  category: FileCategory,
  fileName: string,
): string {
  return `${clientId}/${STORAGE_PREFIX[category]}/${Date.now()}-${sanitizeFileName(
    fileName,
  )}`;
}

function resolveMimeType(name: string, mimeType?: string | null): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  return EXT_MIME[extensionOf(name)] ?? "application/octet-stream";
}

/** Best-effort byte size: prefer the picker's value, else stat the file. */
async function resolveSize(uri: string, size?: number | null): Promise<number> {
  if (typeof size === "number" && size > 0) return size;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === "number" ? info.size : 0;
  } catch {
    return 0;
  }
}

/** Returns a human error string if the file is not allowed, else `null`. */
export function validatePickedFile(file: PickedFile): string | null {
  const ext = extensionOf(file.name);
  const mimeOk = ALLOWED_MIME.has(file.mimeType.toLowerCase());
  const extOk = ALLOWED_EXT.has(ext);
  if (!mimeOk && !extOk) {
    return `Unsupported file type. Allowed: ${ALLOWED_TYPES_LABEL}.`;
  }
  if (file.size <= 0) return "That file appears to be empty.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return "That file is over the 25 MB limit.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pickers — each returns a normalized PickedFile, or null when the user cancels.
// ---------------------------------------------------------------------------

export async function pickFromCamera(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Camera permission is required to take a photo.");
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.9,
    exif: false,
  });
  return normalizeImageAsset(result);
}

export async function pickFromLibrary(): Promise<PickedFile | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Photo library permission is required to choose a photo.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.9,
    exif: false,
  });
  return normalizeImageAsset(result);
}

export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/jpeg", "image/png", "image/heic"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const name = asset.name || "document";
  return {
    uri: asset.uri,
    name,
    mimeType: resolveMimeType(name, asset.mimeType),
    size: await resolveSize(asset.uri, asset.size),
    isImage: resolveMimeType(name, asset.mimeType).startsWith("image/"),
  };
}

async function normalizeImageAsset(
  result: ImagePicker.ImagePickerResult,
): Promise<PickedFile | null> {
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const name =
    asset.fileName || `photo-${Date.now()}.${extensionOf(asset.uri) || "jpg"}`;
  return {
    uri: asset.uri,
    name,
    mimeType: resolveMimeType(name, asset.mimeType),
    size: await resolveSize(asset.uri, asset.fileSize),
    isImage: true,
  };
}

// ---------------------------------------------------------------------------
// Upload — direct to Supabase Storage REST (for progress + cancellation), then
// the same client_files + file_activity inserts the web action performs. The
// user's own access token is the bearer, so storage + table RLS apply exactly
// as they do on the web (portal user → their client's uploads/ only, gated on
// can_upload). No new infrastructure, no RLS bypass.
// ---------------------------------------------------------------------------

export interface FileUploadParams {
  clientId: string;
  file: PickedFile;
  /** Final display name (already including extension), e.g. a renamed file. */
  displayName: string;
  category?: FileCategory;
  folderId?: string | null;
  /** When uploaded from an invoice, recorded in the activity log for context. */
  invoiceNumber?: string;
}

export interface FileUploadHandle {
  promise: Promise<void>;
  cancel: () => void;
}

export class UploadCancelledError extends Error {
  constructor() {
    super("Upload cancelled.");
    this.name = "UploadCancelledError";
  }
}

/**
 * Starts an upload and returns a handle exposing the in-flight promise and a
 * `cancel()`. `onProgress` receives a 0–1 ratio. Resolves on success; rejects
 * with `UploadCancelledError` on cancel or an `Error` on failure (so the caller
 * can offer retry).
 */
export function startFileUpload(
  params: FileUploadParams,
  onProgress: (ratio: number) => void,
): FileUploadHandle {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      promise: Promise.reject(new Error("Supabase is not configured.")),
      cancel: () => {},
    };
  }

  let cancelled = false;
  let task: FileSystem.UploadTask | undefined;

  const promise = (async () => {
    const category = params.category ?? "uploads";
    if (!FILE_CATEGORIES.includes(category)) {
      throw new Error("Select a valid file category.");
    }
    const displayName = sanitizeFileName(params.displayName);
    const path = buildUploadPath(params.clientId, category, displayName);
    const contentType = resolveMimeType(displayName, params.file.mimeType);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Your session has expired. Sign in again.");
    if (cancelled) throw new UploadCancelledError();

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("owner_id")
      .eq("id", params.clientId)
      .maybeSingle();
    if (clientError) throw new Error(clientError.message);
    if (!client?.owner_id) {
      throw new Error("The selected client is no longer available.");
    }

    const isAdmin = client.owner_id === session.user.id;
    if (!isAdmin && category !== "uploads") {
      throw new Error("Portal uploads must use the uploads category.");
    }
    if (!isAdmin && params.folderId) {
      throw new Error("Portal uploads cannot select an admin folder.");
    }

    let folderId = params.folderId ?? null;
    if (folderId) {
      const { data: folder, error: folderError } = await supabase
        .from("client_file_folders")
        .select("id")
        .eq("id", folderId)
        .eq("client_id", params.clientId)
        .eq("category", category)
        .maybeSingle();
      if (folderError) throw new Error(folderError.message);
      if (!folder) throw new Error("The selected folder is no longer available.");
      folderId = folder.id;
    }
    if (cancelled) throw new UploadCancelledError();

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(
      path,
    )}`;

    task = FileSystem.createUploadTask(
      uploadUrl,
      params.file.uri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": contentType,
          "x-upsert": "false",
          "cache-control": "3600",
        },
      },
      (data) => {
        if (data.totalBytesExpectedToSend > 0) {
          onProgress(data.totalBytesSent / data.totalBytesExpectedToSend);
        }
      },
    );

    const response = await task.uploadAsync();
    if (cancelled) throw new UploadCancelledError();
    if (!response || response.status >= 300) {
      // Storage returns JSON like {"error":"Duplicate","message":"..."}.
      const message = parseStorageError(response?.body) ?? "Upload failed.";
      throw new Error(message);
    }

    // Object is stored; now record metadata exactly like the web action. The
    // file owner is always the client's admin, including portal-user uploads.
    const { data: row, error: rowError } = await supabase
      .from("client_files")
      .insert({
        owner_id: client.owner_id,
        client_id: params.clientId,
        folder_id: folderId,
        category,
        storage_path: path,
        name: displayName,
        size_bytes: params.file.size,
        mime_type: contentType,
        uploaded_by: session.user.id,
      })
      .select("id")
      .single();

    if (rowError || !row) {
      // Best-effort orphan cleanup (portal RLS may deny delete — harmless).
      await supabase.storage
        .from(BUCKET)
        .remove([path])
        .catch(() => {});
      throw new Error(rowError?.message ?? "Could not save the file record.");
    }

    await supabase
      .from("file_activity")
      .insert({
        owner_id: client.owner_id,
        client_id: params.clientId,
        file_id: row.id,
        actor_id: session.user.id,
        action: "upload",
        detail: {
          name: displayName,
          category,
          by: isAdmin ? "admin" : "client",
          ...(params.invoiceNumber ? { invoice: params.invoiceNumber } : {}),
        },
      })
      .then(() => {}, () => {}); // activity logging is non-fatal
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancelAsync().catch(() => {});
    },
  };
}

function parseStorageError(body: string | undefined): string | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    return parsed.message ?? parsed.error ?? null;
  } catch {
    return null;
  }
}
