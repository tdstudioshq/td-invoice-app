"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOwnedClient, toFieldErrors } from "@/lib/action-helpers";
import { getCompanySettings } from "@/lib/data";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { OWNER_RESOLVE_ERROR, currentOwnerId, requireAdmin } from "@/lib/auth";
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
  normalizeEmail,
  sanitizeFileName,
} from "@/lib/portal";
import type { ActionState } from "@/app/actions/types";
import type { FileCategory } from "@/lib/types/database";

const BUCKET = "client-files";

/** Generate a strong temporary password that satisfies common complexity rules. */
function generateTempPassword(): string {
  return `${randomBytes(9).toString("base64url")}Aa1!`;
}

/**
 * The two unique constraints on `client_users`, which between them define who
 * may hold a portal:
 *   * ONE_PER_USER   — `user_id` is UNIQUE (0003). One person, one portal.
 *   * ONE_PER_CLIENT — partial unique index on `client_id where revoked_at is
 *                      null` (20260824022608). One client, one active login.
 *
 * A 23505 from each means something completely different — the first is a
 * harmless duplicate approval of the same person, the second is a genuine
 * collision over someone else's portal — so the two are never handled alike.
 */
const ONE_PER_USER = "client_users_user_id_key";
const ONE_PER_CLIENT = "client_users_one_active_per_client";

/**
 * Whether a Postgres error is a unique violation of one specific constraint.
 * PostgREST surfaces the constraint name inside `message`/`details` rather than
 * as its own field, so matching on the name is the only way to tell them apart.
 */
function isUniqueViolation(
  error: { code?: string | null; message?: string | null; details?: string | null },
  constraint: string,
): boolean {
  if (error.code !== "23505") return false;
  return `${error.message ?? ""} ${error.details ?? ""}`.includes(constraint);
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
  const { supabase, ownerId } = owned;

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
    owner_id: ownerId,
    user_id: created.user.id,
    client_id: parsed.data.client_id,
    email: parsed.data.email,
    can_upload: parsed.data.can_upload,
    // Cleared by clear_must_change_password() once the user sets their own
    // password (either via the emailed recovery link or /portal/account).
    must_change_password: true,
  });
  if (mapError) {
    // Roll back the orphaned auth user so the email can be retried.
    await admin.auth.admin.deleteUser(created.user.id);
    // The "one active login per client" read above is a TOCTOU check; the
    // partial unique index (20260824022608) is what actually enforces it. Say
    // so in English rather than surfacing the raw constraint violation.
    if (isUniqueViolation(mapError, ONE_PER_CLIENT)) {
      return {
        error:
          "This client already has a portal login. Revoke it from this page before inviting a different address.",
      };
    }
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

/**
 * Approve a customer self-signup: give them a client portal.
 *
 * This is the whole approval workflow — one button, no form. It reuses an
 * existing `clients` row when the signup email clearly matches one, so a
 * customer you already invoiced walks into their existing files, projects and
 * invoices rather than an empty portal beside a duplicate client record.
 *
 * Safety properties, in the order they are established:
 *   * ADMIN ONLY — `requireAdmin()` first, before anything is read. The
 *     service-role client is used solely to read the applicant's own profile
 *     (profile RLS is owner-only, so no admin policy exists to read it with);
 *     every write below goes through the cookie-scoped client and stays subject
 *     to the owner-scoped RLS from 0002/0017.
 *   * IDEMPOTENT — `client_users.user_id` is UNIQUE (0003), so a duplicate is
 *     impossible at the database level. A double click finds the existing
 *     mapping and reports success; a genuine race loses on the constraint and
 *     is caught as `23505` and reported the same way. Neither path creates a
 *     second client or a second mapping.
 *   * LEAVES NOTHING BEHIND — a lost race that had already created a client
 *     deletes it again, so repeated or concurrent approval cannot silt up the
 *     client list with empty duplicates. The two unique constraints are told
 *     apart by name: losing to ONE_PER_USER is this same signup being approved
 *     twice (success), losing to ONE_PER_CLIENT is a DIFFERENT signup taking
 *     that client's portal (an error — reporting success there would claim an
 *     approval that did not happen).
 *   * NEVER GUESSES — zero email matches creates a client; exactly one links to
 *     it; two or more refuses and says so, because picking wrong would expose
 *     one customer's files to another. A matched client that already belongs to
 *     a different portal login refuses for the same reason.
 *   * ACCESS ONLY — an existing client's own settings are not touched, and the
 *     new mapping grants nothing beyond entry: `can_upload` starts FALSE, the
 *     same default as the admin invite flow, and is turned on per client from
 *     that client's portal page when it is actually wanted. Approval answers
 *     "is this person my client", not "may they write to my storage".
 *     `must_change_password` is false because they chose their own password at
 *     signup.
 */
export async function approvePortalAccessAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = z.string().uuid().safeParse(formData.get("user_id"));
  if (!userId.success) return { error: "Invalid signup." };

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }
  if (!isSupabaseAdminConfigured()) {
    return {
      error:
        "Approving access needs SUPABASE_URL and SUPABASE_SECRET_KEY. See README.",
    };
  }

  const admin = await requireAdmin();
  if (!admin) return { error: "Supabase is not configured. See README setup." };

  const service = createAdminClient();
  const supabase = await createClient();

  // 1. The applicant's own profile (service-role: profile RLS is owner-only).
  const { data: profile } = await service
    .from("profiles")
    .select("id, full_name, email, business_name, phone")
    .eq("id", userId.data)
    .maybeSingle();
  if (!profile) return { error: "That signup no longer exists." };

  const email = normalizeEmail(profile.email);
  if (!email) return { error: "That signup has no email address to match on." };

  // 2. Already decided? `user_id` is unique, so at most one row can exist.
  const { data: existingMapping } = await service
    .from("client_users")
    .select("id, revoked_at")
    .eq("user_id", userId.data)
    .maybeSingle();
  if (existingMapping) {
    if (!existingMapping.revoked_at) {
      revalidatePath("/dashboard");
      return { success: true };
    }
    return {
      error:
        "This account's portal access was revoked. Restore it from that client's portal page instead of approving again.",
    };
  }

  // 3. Match an existing client by email. RLS scopes this to the admin's own
  //    clients, which are the only rows they may link a portal to anyway.
  const { data: clientRows, error: clientError } = await supabase
    .from("clients")
    .select("id, company_name, email");
  if (clientError) return { error: clientError.message };

  // Every row written below belongs to the canonical workspace owner, not to
  // whichever admin clicked Approve — otherwise a second admin's approval would
  // create a client the other admins cannot see.
  const ownerId = await currentOwnerId(supabase);
  if (!ownerId) return { error: OWNER_RESOLVE_ERROR };

  const matches = (clientRows ?? []).filter(
    (row) => normalizeEmail(row.email) === email,
  );
  if (matches.length > 1) {
    return {
      error: `${matches.length} clients share the email ${email} (${matches
        .map((m) => m.company_name)
        .join(", ")}). Merge or correct them first — approval will not guess.`,
    };
  }

  let clientId = matches[0]?.id;
  // Tracks whether THIS invocation created the client, so a failed mapping can
  // take it back out again. Only ever true for a row we inserted moments ago
  // and hold the id of — never for a client that already existed.
  let createdClientId: string | null = null;

  if (clientId) {
    // 4a. Reuse it — unless someone else already holds that portal. One active
    //     login per client is the existing rule (see createPortalUserAction).
    const { data: taken } = await service
      .from("client_users")
      .select("email")
      .eq("client_id", clientId)
      .is("revoked_at", null)
      .maybeSingle();
    if (taken) {
      return {
        error: `${matches[0].company_name} already has a portal login (${taken.email ?? "another account"}). Revoke it first if this signup should replace it.`,
      };
    }
  } else {
    // 4b. No match — create the client. `company_name` is required, so fall
    //     back through business name → person's name → email.
    const companyName =
      profile.business_name?.trim() ||
      profile.full_name?.trim() ||
      email;
    const { data: created, error: createError } = await supabase
      .from("clients")
      .insert({
        owner_id: ownerId,
        company_name: companyName,
        contact_name: profile.full_name?.trim() || null,
        email,
        phone: profile.phone?.trim() || null,
      })
      .select("id")
      .single();
    if (createError || !created) {
      return { error: createError?.message ?? "Could not create the client." };
    }
    clientId = created.id;
    createdClientId = created.id;
  }

  // 5. The mapping itself — this is what makes them a portal user.
  const { error: mapError } = await supabase.from("client_users").insert({
    owner_id: ownerId,
    user_id: userId.data,
    client_id: clientId,
    email,
    // Access only. Uploads are enabled deliberately, per client, later.
    can_upload: false,
    // They set their own password at signup, so there is nothing to force.
    must_change_password: false,
  });
  if (mapError) {
    // The client row was created for a mapping that did not happen. Take it
    // back out so a lost race cannot leave an empty duplicate client behind —
    // the same compensating cleanup createPortalUserAction does for its
    // orphaned auth user. Safe unconditionally: `createdClientId` is only set
    // for a row this invocation inserted seconds ago, which by construction has
    // no invoices, projects or files hanging off it.
    if (createdClientId) {
      const { error: cleanupError } = await supabase
        .from("clients")
        .delete()
        .eq("id", createdClientId);
      if (cleanupError) {
        // Losing the cleanup is the old behavior, not a new failure: an empty
        // client row survives. Log it and carry on rather than reporting a
        // failure for an approval that may well have succeeded.
        console.error("approvePortalAccess cleanup", cleanupError.message);
      }
    }

    // One client, one active login (20260824022608). Someone else took this
    // portal between the check above and this insert — a real collision, and
    // the opposite of idempotent, so it must never report success.
    if (isUniqueViolation(mapError, ONE_PER_CLIENT)) {
      return {
        error:
          "That client just received a portal login from another approval. Reload the dashboard and check who holds it before approving again.",
      };
    }
    // One person, one portal (0003). A double-click or a concurrent approval of
    // this same signup won the race — the mapping they wanted now exists, so
    // this is the idempotent path, not an error.
    if (isUniqueViolation(mapError, ONE_PER_USER) || mapError.code === "23505") {
      revalidatePath("/dashboard");
      return { success: true };
    }
    return { error: mapError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/client-portals");
  revalidatePath(`/client-portals/${clientId}`);
  return { success: true };
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
    owner_id: owned.ownerId,
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
//
// Admin uploads live in app/actions/uploads.ts (signed-upload-URL pipeline —
// file bytes never pass through a Server Action); only rename/delete remain
// here.
// ---------------------------------------------------------------------------

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
  const { supabase, ownerId, userId } = owned;

  const { data: file } = await supabase
    .from("client_files")
    .select("storage_path, name")
    .eq("id", id)
    .maybeSingle();
  if (!file) return;

  await supabase.storage.from(BUCKET).remove([file.storage_path]);
  await supabase.from("client_files").delete().eq("id", id);
  await supabase.from("file_activity").insert({
    owner_id: ownerId,
    client_id: clientId,
    actor_id: userId,
    action: "delete",
    detail: { name: file.name, by: "admin" },
  });

  revalidatePath(`/client-portals/${clientId}`);
}
