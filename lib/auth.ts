import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Admins are identified EXCLUSIVELY by an explicit server-side allowlist
 * (`ADMIN_EMAILS`, a comma-separated list). Role is never inferred from the
 * absence of data and never stored in a user-writable row, so a self-signup
 * customer can never be — or become — an admin.
 *
 * IMPORTANT: if `ADMIN_EMAILS` is empty, NOBODY is an admin (the dashboard is
 * inaccessible). Set it to your admin address(es) in `.env.local` and Vercel.
 */
function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

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
  /** True until the user replaces their provisioned temp password. */
  mustChangePassword: boolean;
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
    .select("client_id, can_upload, must_change_password")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    userId: user.id,
    email: user.email ?? null,
    clientId: data.client_id,
    canUpload: data.can_upload,
    mustChangePassword: data.must_change_password,
  };
}

export interface CustomerProfile {
  userId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  instagram: string | null;
  businessName: string | null;
  onboardedAt: string | null;
}

/**
 * The current user's customer profile row, or `null` if they have none yet.
 * Used to decide whether a customer still needs onboarding. Owner-scoped by RLS.
 */
export async function getCustomerProfile(
  userId: string,
): Promise<CustomerProfile | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, instagram, business_name, onboarded_at")
    .eq("id", userId)
    .maybeSingle();

  if (!data) return null;
  return {
    userId: data.id,
    email: data.email,
    fullName: data.full_name,
    phone: data.phone,
    instagram: data.instagram,
    businessName: data.business_name,
    onboardedAt: data.onboarded_at,
  };
}

/**
 * The correct landing path for a signed-in user, by role:
 *   admin → `adminTarget` (default `/dashboard`), portal → `/portal`,
 *   customer → `/onboarding` until onboarded, then `/account`.
 */
export async function roleHome(
  user: User,
  adminTarget = "/dashboard",
): Promise<string> {
  if (isAdminEmail(user.email)) return adminTarget;
  if (await getPortalContext()) return "/portal";
  const profile = await getCustomerProfile(user.id);
  return profile?.onboardedAt ? "/account" : "/onboarding";
}

/**
 * Require an ADMIN user (email in the `ADMIN_EMAILS` allowlist). Non-admins are
 * sent to their own area (portal or customer account), never the dashboard;
 * unauthenticated users to login. Guards every page/action in the `(app)` group.
 */
export async function requireAdmin() {
  if (!isSupabaseConfigured()) return null;
  const user = await getUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect(await roleHome(user));
  return user;
}

export interface CustomerContext {
  user: User;
  profile: CustomerProfile | null;
}

/**
 * Require a CUSTOMER user (authenticated, NOT an admin, NOT a portal user).
 * Admins go to `/dashboard`, portal users to `/portal`, unauthenticated to
 * login. Returns the user plus their profile (which may be null pre-onboarding).
 * Guards the `(customer)` route group (`/onboarding`, `/account`).
 */
export async function requireCustomer(): Promise<CustomerContext | null> {
  if (!isSupabaseConfigured()) return null;
  const user = await getUser();
  if (!user) redirect("/login");
  if (isAdminEmail(user.email)) redirect("/dashboard");
  if (await getPortalContext()) redirect("/portal");
  return { user, profile: await getCustomerProfile(user.id) };
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
