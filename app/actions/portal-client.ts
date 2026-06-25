"use server";

import { revalidatePath } from "next/cache";

import { requirePortalUser } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  MAX_UPLOAD_BYTES,
  buildStoragePath,
  formatBytes,
  sanitizeFileName,
} from "@/lib/portal";
import type { ActionState } from "@/app/actions/types";

const BUCKET = "client-files";

/**
 * Upload performed by a CLIENT-PORTAL user. Hardened so a portal user can only
 * ever write into their OWN client's `uploads/` area, and only when the admin has
 * enabled uploads:
 *   - the client id is taken from the server-side session (never the form),
 *   - the category is forced to "uploads",
 *   - can_upload is re-checked here AND enforced by storage + table RLS.
 */
export async function uploadOwnFileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const portal = await requirePortalUser();
  if (!portal) return { error: "You must be signed in." };
  if (!portal.canUpload) {
    return { error: "Uploads are not enabled for your account." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { file: "Choose a file to upload" } };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      fieldErrors: {
        file: `File exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} limit`,
      },
    };
  }

  const clientId = portal.clientId;
  const displayName = sanitizeFileName(file.name);
  const path = buildStoragePath(clientId, "uploads", file.name);

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) return { error: uploadError.message };

  // owner_id is set to the workspace owner (the client's admin) so admins still
  // see client-uploaded files; the portal INSERT RLS policy permits this.
  const { data: client } = await supabase
    .from("clients")
    .select("owner_id")
    .eq("id", clientId)
    .maybeSingle();

  const { data: row, error: rowError } = await supabase
    .from("client_files")
    .insert({
      owner_id: client?.owner_id ?? null,
      client_id: clientId,
      category: "uploads",
      storage_path: path,
      name: displayName,
      size_bytes: file.size,
      mime_type: file.type || null,
      uploaded_by: portal.userId,
    })
    .select("id")
    .single();
  if (rowError) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: rowError.message };
  }

  await supabase.from("file_activity").insert({
    owner_id: client?.owner_id ?? null,
    client_id: clientId,
    file_id: row.id,
    actor_id: portal.userId,
    action: "upload",
    detail: { name: displayName, by: "client" },
  });

  revalidatePath("/portal/files");
  revalidatePath("/portal");
  return { success: true };
}
