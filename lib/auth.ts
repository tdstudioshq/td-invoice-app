import { redirect } from "next/navigation";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * The currently signed-in Supabase user, or `null` when there is no session
 * (or when Supabase isn't configured, so the app can still run against an empty
 * database during local setup).
 *
 * Always uses `auth.getUser()` — which revalidates the token with the Supabase
 * Auth server — rather than trusting the unverified session cookie.
 */
export async function getUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Require an authenticated user in a Server Component or Server Action, sending
 * them to the login page otherwise. Returns the user so callers can use its id.
 *
 * When Supabase isn't configured we skip the redirect so the UI still renders
 * its empty states (matching the rest of the app's graceful-degradation guard).
 */
export async function requireUser() {
  if (!isSupabaseConfigured()) return null;
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
