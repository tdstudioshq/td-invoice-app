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

export interface PortalContext {
  userId: string;
  email: string | null;
  clientId: string;
  canUpload: boolean;
}

/**
 * The client-portal context for the current user, or `null` when they are not a
 * portal user (i.e. they're an admin) or no session exists. A user is a portal
 * user iff they have an un-revoked `client_users` row. This single query is the
 * basis for every role decision in the app.
 */
export async function getPortalContext(): Promise<PortalContext | null> {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("client_users")
    .select("client_id, can_upload")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    userId: user.id,
    email: user.email ?? null,
    clientId: data.client_id,
    canUpload: data.can_upload,
  };
}

/**
 * Require an ADMIN user (authenticated and NOT a client-portal user). Portal
 * users are redirected to their portal; unauthenticated users to login. Use this
 * to guard every page/action in the admin `(app)` route group.
 */
export async function requireAdmin() {
  if (!isSupabaseConfigured()) return null;
  const user = await getUser();
  if (!user) redirect("/login");
  if (await getPortalContext()) redirect("/portal");
  return user;
}

/**
 * Require a CLIENT-PORTAL user. Admins are redirected to the dashboard;
 * unauthenticated users to login. Returns the portal context (client id +
 * upload permission) so callers can scope their queries.
 */
export async function requirePortalUser(): Promise<PortalContext | null> {
  if (!isSupabaseConfigured()) return null;
  const user = await getUser();
  if (!user) redirect("/login");
  const portal = await getPortalContext();
  if (!portal) redirect("/dashboard");
  return portal;
}
