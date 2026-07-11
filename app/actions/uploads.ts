"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnedClient } from "@/lib/action-helpers";
import {
  FILE_CATEGORIES,
  MAX_UPLOAD_BYTES,
  STORAGE_PREFIX,
  buildStoragePath,
  formatBytes,
  sanitizeFileName,
} from "@/lib/portal";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_BATCH_FILES,
  extensionOf,
  resolveUploadContentType,
  validateUploadFile,
} from "@/lib/uploads";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { ActionState } from "@/app/actions/types";
import type { FileCategory } from "@/lib/types/database";

// Admin multi-file upload pipeline. File bytes go straight from the browser to
// Supabase Storage — never through a Server Action (Next caps those bodies at
// ~4 MB, Vercel at ~4.5 MB). The server stays the trust boundary:
//   1. createUploadTicketsAction validates everything and mints signed upload
//      URLs locked to server-built paths — nothing uploads without a ticket.
//   2. The bucket's file_size_limit (migration 0016) caps the actual bytes.
//   3. finalizeUploadAction verifies the stored object via storage.info()
//      before writing the client_files row, and removes the object if the row
//      insert fails.

const BUCKET = "client-files";

export interface UploadTicketRequest {
  name: string;
  size: number;
  type: string | null;
}

export type UploadTicket =
  | {
      name: string;
      ok: true;
      path: string;
      token: string;
      signedUrl: string;
      contentType: string;
    }
  | { name: string; ok: false; error: string };

const categorySchema = z.enum(
  FILE_CATEGORIES as [FileCategory, ...FileCategory[]],
);

const ticketsInputSchema = z.object({
  clientId: z.string().uuid(),
  category: categorySchema,
  folderId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        size: z.number().int().positive(),
        type: z.string().nullable(),
      }),
    )
    .min(1)
    .max(MAX_BATCH_FILES, `At most ${MAX_BATCH_FILES} files per batch.`),
});

type OwnedClientContext = Extract<
  Awaited<ReturnType<typeof requireOwnedClient>>,
  { supabase: unknown }
>;

/**
 * Validate that an optional folder/project actually belongs to this client
 * (and, for folders, this category). RLS already hides other admins' rows;
 * this guards against mixing up one's own clients.
 */
async function validateAttachments(
  supabase: OwnedClientContext["supabase"],
  clientId: string,
  category: FileCategory,
  folderId: string | null,
  projectId: string | null,
): Promise<string | null> {
  if (folderId) {
    const { data } = await supabase
      .from("client_file_folders")
      .select("id")
      .eq("id", folderId)
      .eq("client_id", clientId)
      .eq("category", category)
      .maybeSingle();
    if (!data) return "Folder not found for this client and category.";
  }
  if (projectId) {
    const { data } = await supabase
      .from("client_projects")
      .select("id")
      .eq("id", projectId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (!data) return "Project not found for this client.";
  }
  return null;
}

/**
 * Mint one signed upload URL per file. Per-file validation failures ride back
 * as per-file errors — one bad file never fails the batch.
 */
export async function createUploadTicketsAction(input: {
  clientId: string;
  category: FileCategory;
  folderId: string | null;
  projectId: string | null;
  files: UploadTicketRequest[];
}): Promise<{ error?: string; tickets?: UploadTicket[] }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const parsed = ticketsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid upload request." };
  }
  const { clientId, category, folderId, projectId, files } = parsed.data;

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return { error: owned.error };
  const { supabase } = owned;

  const attachError = await validateAttachments(
    supabase,
    clientId,
    category,
    folderId,
    projectId,
  );
  if (attachError) return { error: attachError };

  const tickets: UploadTicket[] = [];
  for (const file of files) {
    const invalid = validateUploadFile(file.name, file.size, file.type);
    if (invalid) {
      tickets.push({ name: file.name, ok: false, error: invalid });
      continue;
    }
    const path = buildStoragePath(clientId, category, file.name);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      tickets.push({
        name: file.name,
        ok: false,
        error: error?.message ?? "Could not create an upload URL.",
      });
      continue;
    }
    tickets.push({
      name: file.name,
      ok: true,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
      contentType: resolveUploadContentType(file.name, file.type),
    });
  }

  return { tickets };
}

const finalizeInputSchema = z.object({
  clientId: z.string().uuid(),
  category: categorySchema,
  folderId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  path: z.string().min(1).max(500),
  displayName: z.string().min(1).max(300),
});

/**
 * Record an uploaded object in client_files. Size and MIME are taken from the
 * stored object (storage.info()), never from the client. Called once per file
 * as each upload completes.
 */
export async function finalizeUploadAction(input: {
  clientId: string;
  category: FileCategory;
  folderId: string | null;
  projectId: string | null;
  path: string;
  displayName: string;
}): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const parsed = finalizeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid file." };
  }
  const { clientId, category, folderId, projectId, path, displayName } =
    parsed.data;

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return { error: owned.error };
  const { supabase, userId } = owned;

  // The path must be exactly what a ticket for this client/category could have
  // produced: `{clientId}/{prefix}/{timestamp}-{sanitized name}` with an
  // allowlisted extension. clientId is a validated uuid and the prefix is a
  // known constant, so this regex is built from trusted parts only. If the
  // shape/extension is wrong an object may already sit in Storage (the browser
  // uploaded before finalizing) — remove it so we never leave an orphan.
  const removeOrphan = () =>
    supabase.storage
      .from(BUCKET)
      .remove([path])
      .then(() => undefined);
  const pathPattern = new RegExp(
    `^${clientId}/${STORAGE_PREFIX[category]}/\\d+-[\\w.\\-]{1,200}$`,
  );
  if (!pathPattern.test(path)) {
    await removeOrphan();
    return { error: "Unexpected storage path." };
  }
  const ext = extensionOf(path);
  if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    await removeOrphan();
    return { error: "Unexpected file type." };
  }

  const attachError = await validateAttachments(
    supabase,
    clientId,
    category,
    folderId,
    projectId,
  );
  if (attachError) return { error: attachError };

  const { data: info, error: infoError } = await supabase.storage
    .from(BUCKET)
    .info(path);
  if (infoError || !info) {
    return { error: "The file never reached storage. Try uploading it again." };
  }
  const sizeBytes = info.size ?? 0;
  if (sizeBytes <= 0) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: "The uploaded file is empty." };
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    // The bucket file_size_limit should have blocked this; belt and braces.
    await supabase.storage.from(BUCKET).remove([path]);
    return {
      error: `File exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`,
    };
  }

  const name = sanitizeFileName(displayName);
  const { data: row, error: rowError } = await supabase
    .from("client_files")
    .insert({
      owner_id: userId,
      client_id: clientId,
      folder_id: folderId,
      project_id: projectId,
      category,
      storage_path: path,
      name,
      size_bytes: sizeBytes,
      mime_type: info.contentType ?? null,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (rowError) {
    // Clean up the orphaned object if the metadata insert fails.
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: rowError.message };
  }

  await supabase.from("file_activity").insert({
    owner_id: userId,
    client_id: clientId,
    file_id: row.id,
    actor_id: userId,
    action: "upload",
    detail: { name, category, by: "admin" },
  });

  revalidatePath(`/client-portals/${clientId}`);
  if (projectId) {
    revalidatePath(`/client-portals/${clientId}/projects/${projectId}`);
  }
  return { success: true };
}
