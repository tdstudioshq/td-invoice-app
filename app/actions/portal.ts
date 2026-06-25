"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { getCompanySettings } from "@/lib/data";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import {
  EMAIL_FROM,
  getResend,
  getSiteUrl,
  isResendConfigured,
} from "@/lib/email/client";
import { portalInviteEmail } from "@/lib/email/templates";
import {
  FILE_CATEGORIES,
  MAX_UPLOAD_BYTES,
  buildStoragePath,
  formatBytes,
  sanitizeFileName,
} from "@/lib/portal";
import type { ActionState } from "@/app/actions/types";
import type { FileCategory } from "@/lib/types/database";

const BUCKET = "client-files";

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Generate a strong temporary password that satisfies common complexity rules. */
function generateTempPassword(): string {
  return `${randomBytes(9).toString("base64url")}Aa1!`;
}

/**
 * Confirm the current admin owns `clientId`. Returns the cookie-scoped client and
 * the admin's user id, or an error state. RLS already restricts `clients` to the
 * owner, so a found row proves ownership.
 */
async function requireOwnedClient(clientId: string) {
  const user = await requireAdmin();
  if (!user) {
    return { error: "Supabase is not configured. See README setup." as string };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, owner_id")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !data) {
    return { error: "Client not found." as string };
  }
  return { supabase, userId: user.id };
}

// ---------------------------------------------------------------------------
// Portal access management
// ---------------------------------------------------------------------------

const createPortalUserSchema = z.object({
  client_id: z.string().uuid("Invalid client"),
  email: z.string().trim().email("Enter a valid email"),
  can_upload: z.boolean(),
});

export async function createPortalUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createPortalUserSchema.safeParse({
    client_id: formData.get("client_id"),
    email: formData.get("email"),
    can_upload: formData.get("can_upload") === "on",
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }
  if (!isSupabaseAdminConfigured()) {
    return {
      error:
        "Portal-user creation needs SUPABASE_URL and SUPABASE_SECRET_KEY. See README.",
    };
  }

  const owned = await requireOwnedClient(parsed.data.client_id);
  if ("error" in owned) return { error: owned.error };
  const { supabase, userId } = owned;

  // One active portal login per client.
  const { data: existing } = await supabase
    .from("client_users")
    .select("id")
    .eq("client_id", parsed.data.client_id)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing) {
    return { error: "This client already has a portal login." };
  }

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: tempPassword,
      email_confirm: true,
    });
  if (createError || !created.user) {
    return {
      error:
        createError?.message ??
        "Could not create the portal user. Is the email already in use?",
    };
  }

  const { error: mapError } = await supabase.from("client_users").insert({
    owner_id: userId,
    user_id: created.user.id,
    client_id: parsed.data.client_id,
    email: parsed.data.email,
    can_upload: parsed.data.can_upload,
  });
  if (mapError) {
    // Roll back the orphaned auth user so the email can be retried.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: mapError.message };
  }

  revalidatePath("/client-portals");
  revalidatePath(`/client-portals/${parsed.data.client_id}`);

  // Preferred path: email the client a set-password link so the admin never has
  // to hand over a password. Falls back to revealing a one-time temp password
  // when email isn't configured or sending fails.
  if (isResendConfigured()) {
    const { data: link, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "recovery",
        email: parsed.data.email,
        options: { redirectTo: `${getSiteUrl()}/reset-password` },
      });
    const actionUrl = link?.properties?.action_link;
    if (!linkError && actionUrl) {
      const settings = await getCompanySettings();
      const message = portalInviteEmail({
        companyName: settings?.company_name ?? "TD Studios",
        actionUrl,
      });
      try {
        const { error: sendError } = await getResend().emails.send({
          from: EMAIL_FROM,
          to: parsed.data.email,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        if (!sendError) {
          return {
            success: true,
            data: { email: parsed.data.email, invited: "email" },
          };
        }
      } catch {
        // Fall through to the temp-password reveal below.
      }
    }
  }

  return {
    success: true,
    data: { email: parsed.data.email, password: tempPassword },
  };
}

export async function revokePortalAccessAction(
  formData: FormData,
): Promise<void> {
  const clientId = String(formData.get("client_id") ?? "");
  if (!clientId || !isSupabaseConfigured()) return;

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return;
  const { supabase } = owned;

  const { data: mapping } = await supabase
    .from("client_users")
    .select("user_id")
    .eq("client_id", clientId)
    .is("revoked_at", null)
    .maybeSingle();

  if (mapping?.user_id && isSupabaseAdminConfigured()) {
    // Deleting the auth user cascades to client_users (FK on delete cascade), so
    // the revoked user can no longer authenticate at all — closing the implicit
    // "no portal row == admin" gap.
    await createAdminClient().auth.admin.deleteUser(mapping.user_id);
  } else {
    // Fallback when the service key is absent: at least mark the mapping revoked.
    await supabase
      .from("client_users")
      .update({ revoked_at: new Date().toISOString() })
      .eq("client_id", clientId);
  }

  revalidatePath("/client-portals");
  revalidatePath(`/client-portals/${clientId}`);
}

export async function setCanUploadAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") ?? "");
  const canUpload = formData.get("can_upload") === "true";
  if (!clientId || !isSupabaseConfigured()) return;

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return;

  await owned.supabase
    .from("client_users")
    .update({ can_upload: canUpload })
    .eq("client_id", clientId)
    .is("revoked_at", null);

  revalidatePath(`/client-portals/${clientId}`);
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

const categorySchema = z.enum(
  FILE_CATEGORIES as [FileCategory, ...FileCategory[]],
);

const createFolderSchema = z.object({
  client_id: z.string().uuid(),
  category: categorySchema,
  name: z.string().trim().min(1, "Folder name is required").max(120),
});

export async function createFolderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createFolderSchema.safeParse({
    client_id: formData.get("client_id"),
    category: formData.get("category"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const owned = await requireOwnedClient(parsed.data.client_id);
  if ("error" in owned) return { error: owned.error };

  const { error } = await owned.supabase.from("client_file_folders").insert({
    owner_id: owned.userId,
    client_id: parsed.data.client_id,
    category: parsed.data.category,
    name: parsed.data.name,
  });
  if (error) return { error: error.message };

  revalidatePath(`/client-portals/${parsed.data.client_id}`);
  return { success: true };
}

export async function renameFolderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !clientId) return { error: "Missing folder." };
  if (!name) return { fieldErrors: { name: "Folder name is required" } };
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return { error: owned.error };

  const { error } = await owned.supabase
    .from("client_file_folders")
    .update({ name })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/client-portals/${clientId}`);
  return { success: true };
}

export async function deleteFolderAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  if (!id || !clientId || !isSupabaseConfigured()) return;

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return;

  // Files in the folder are not deleted; their folder_id is nulled (FK).
  await owned.supabase.from("client_file_folders").delete().eq("id", id);
  revalidatePath(`/client-portals/${clientId}`);
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export async function adminUploadFileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const clientId = String(formData.get("client_id") ?? "");
  const categoryParse = categorySchema.safeParse(formData.get("category"));
  const folderIdRaw = String(formData.get("folder_id") ?? "");
  const file = formData.get("file");

  if (!clientId) return { error: "Missing client." };
  if (!categoryParse.success) return { error: "Invalid category." };
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { file: "Choose a file to upload" } };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      fieldErrors: { file: `File exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} limit` },
    };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return { error: owned.error };
  const { supabase, userId } = owned;

  const category = categoryParse.data;
  // The folder <Select> uses "none" as its empty sentinel (Radix forbids "").
  const folderId = folderIdRaw && folderIdRaw !== "none" ? folderIdRaw : null;
  const displayName = sanitizeFileName(file.name);
  const path = buildStoragePath(clientId, category, file.name);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (uploadError) return { error: uploadError.message };

  const { data: row, error: rowError } = await supabase
    .from("client_files")
    .insert({
      owner_id: userId,
      client_id: clientId,
      folder_id: folderId,
      category,
      storage_path: path,
      name: displayName,
      size_bytes: file.size,
      mime_type: file.type || null,
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
    detail: { name: displayName, category, by: "admin" },
  });

  revalidatePath(`/client-portals/${clientId}`);
  return { success: true };
}

export async function renameFileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const name = sanitizeFileName(String(formData.get("name") ?? "").trim());
  if (!id || !clientId) return { error: "Missing file." };
  if (!name) return { fieldErrors: { name: "File name is required" } };
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return { error: owned.error };

  // Display name only — the storage object key is immutable.
  const { error } = await owned.supabase
    .from("client_files")
    .update({ name })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/client-portals/${clientId}`);
  return { success: true };
}

// clientId is bound by the caller; the dialog form only carries `id`.
export async function deleteFileAction(
  clientId: string,
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !clientId || !isSupabaseConfigured()) return;

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return;
  const { supabase, userId } = owned;

  const { data: file } = await supabase
    .from("client_files")
    .select("storage_path, name")
    .eq("id", id)
    .maybeSingle();
  if (!file) return;

  await supabase.storage.from(BUCKET).remove([file.storage_path]);
  await supabase.from("client_files").delete().eq("id", id);
  await supabase.from("file_activity").insert({
    owner_id: userId,
    client_id: clientId,
    actor_id: userId,
    action: "delete",
    detail: { name: file.name, by: "admin" },
  });

  revalidatePath(`/client-portals/${clientId}`);
}
