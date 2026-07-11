"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toFieldErrors } from "@/lib/action-helpers";
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

const changePasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    path: ["confirm"],
    message: "Passwords do not match.",
  });

/**
 * In-session password change for a CLIENT-PORTAL user (/portal/account). Runs
 * against the cookie-scoped session — unlike the /reset-password recovery flow,
 * the user stays signed in. On success the must_change_password flag is cleared
 * via the clear_must_change_password() RPC (a portal user has no UPDATE grant
 * on client_users), which removes the layout banner on the next render.
 */
export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const portal = await requirePortalUser();
  if (!portal) return { error: "You must be signed in." };

  const parsed = changePasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: error.message };

  // Best-effort: the password is already changed, so a failure here shouldn't
  // fail the action — the banner will just persist until the next change.
  const { error: rpcError } = await supabase.rpc("clear_must_change_password");
  if (rpcError) {
    console.error("clear_must_change_password", rpcError.message);
  }

  revalidatePath("/portal", "layout");
  return { success: true };
}
