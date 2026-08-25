import "server-only";

import { z } from "zod";

import { OWNER_RESOLVE_ERROR, currentOwnerId, requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Helpers shared by the Server Action modules under app/actions/. They live in
// a plain server module (not a "use server" file) because every export of a
// "use server" module becomes a client-invokable endpoint, and these return
// non-serializable values (a Supabase client).

export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * Confirm the current admin may act on `clientId`. Returns the cookie-scoped
 * client plus TWO ids that are deliberately distinct:
 *
 *   - `ownerId` — the canonical workspace owner, from `current_owner_id()`. Every
 *     `owner_id` column written by the caller must use this, so all workspace
 *     admins read and write one shared dataset instead of forking private ones.
 *   - `userId`  — the actual signed-in admin. Use it only for ATTRIBUTION
 *     columns (`actor_id`, `uploaded_by`), so the activity timeline still shows
 *     which admin did the thing.
 *
 * RLS already restricts `clients` to the workspace, so a found row proves the
 * caller may act on it.
 */
export async function requireOwnedClient(clientId: string) {
  const user = await requireAdmin();
  if (!user) {
    return { error: "Supabase is not configured. See README setup." as string };
  }
  const supabase = await createClient();
  const ownerId = await currentOwnerId(supabase);
  if (!ownerId) return { error: OWNER_RESOLVE_ERROR as string };
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (error || !data) {
    return { error: "Client not found." as string };
  }
  return { supabase, ownerId, userId: user.id };
}
