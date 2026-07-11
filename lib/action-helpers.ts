import "server-only";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
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
 * Confirm the current admin owns `clientId`. Returns the cookie-scoped client and
 * the admin's user id, or an error state. RLS already restricts `clients` to the
 * owner, so a found row proves ownership.
 */
export async function requireOwnedClient(clientId: string) {
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
