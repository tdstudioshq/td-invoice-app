import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getAdminEmails, requireAdmin } from "@/lib/auth";
import { normalizeEmail } from "@/lib/portal";
import type {
  ClientFile,
  ClientPortalSummary,
  ClientUser,
} from "@/lib/types/database";

/**
 * Client-portal reads: summaries, portal users, files, and the
 * self-signup approval queue.
 *
 * Split out of the former lib/data.ts, which had grown to hold nine
 * unrelated domains in one module.
 */

/**
 * One row per client with its portal-access state and file count, for the admin
 * /client-portals list. RLS scopes every query to the current admin's workspace.
 */
export async function getClientPortalSummaries(): Promise<
  ClientPortalSummary[]
> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const [clientsRes, usersRes, filesRes] = await Promise.all([
    supabase.from("clients").select("*").order("company_name"),
    supabase.from("client_users").select("*").is("revoked_at", null),
    supabase.from("client_files").select("client_id"),
  ]);

  if (clientsRes.error) {
    console.error("getClientPortalSummaries", clientsRes.error.message);
    return [];
  }

  const usersByClient = new Map<string, ClientUser>();
  for (const u of usersRes.data ?? []) usersByClient.set(u.client_id, u);

  const fileCounts = new Map<string, number>();
  for (const f of filesRes.data ?? [])
    fileCounts.set(f.client_id, (fileCounts.get(f.client_id) ?? 0) + 1);

  return (clientsRes.data ?? []).map((client) => ({
    ...client,
    portal_user: usersByClient.get(client.id) ?? null,
    file_count: fileCounts.get(client.id) ?? 0,
  }));
}

/** The active portal user mapped to a client, or null. Admin-scoped via RLS. */
export async function getPortalUserForClient(
  clientId: string,
): Promise<ClientUser | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_users")
    .select("*")
    .eq("client_id", clientId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) {
    console.error("getPortalUserForClient", error.message);
    return null;
  }
  return data;
}

/**
 * Files for a client. RLS returns admin-owned files or the portal user's own.
 * Options: `projectId` filters to one project, `activeOnly` hides archived
 * files (used by the admin "view as client" preview — portal RLS already hides
 * them for real portal sessions), `limit` caps the result (e.g. recent files).
 */
export async function getClientFiles(
  clientId: string,
  opts: { projectId?: string; activeOnly?: boolean; limit?: number } = {},
): Promise<ClientFile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  let query = supabase
    .from("client_files")
    .select("*")
    .eq("client_id", clientId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (opts.projectId) query = query.eq("project_id", opts.projectId);
  if (opts.activeOnly) query = query.is("archived_at", null);
  if (opts.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) {
    console.error("getClientFiles", error.message);
    return [];
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Client projects
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pending portal access (customer self-signups awaiting admin approval)
// ---------------------------------------------------------------------------

export interface PendingPortalSignup {
  userId: string;
  fullName: string | null;
  email: string | null;
  businessName: string | null;
  signedUpAt: string;
  /**
   * An existing `clients` row whose email matches this signup, if exactly one
   * does. Shown so the admin knows approval will REUSE their history rather
   * than create a second client. `null` covers both "no match" and "more than
   * one match" — the ambiguous case is resolved (and refused) at approval time,
   * where it can be reported properly.
   */
  matchedClient: { id: string; company_name: string } | null;
}

/**
 * Customers who have finished signing up but have no portal yet.
 *
 * Reads `profiles` through the SERVICE-ROLE client because profile RLS is
 * owner-only — an admin has no policy that would let the cookie-scoped client
 * see anyone else's row (see 0009_profiles.sql). `requireAdmin()` is re-asserted
 * here rather than trusted from the caller, per the service-role rule in
 * CLAUDE.md, and only the four display fields below are ever returned.
 *
 * "Pending" is derived, not stored: a completed profile with no `client_users`
 * row. Approval creates that row, which removes them from this list — so there
 * is no status column to keep in sync and no second source of truth.
 */
export async function getPendingPortalSignups(): Promise<PendingPortalSignup[]> {
  if (!isSupabaseConfigured() || !isSupabaseAdminConfigured()) return [];
  const admin = await requireAdmin();
  if (!admin) return [];

  const service = createAdminClient();
  const [{ data: profiles, error }, { data: mapped }] = await Promise.all([
    service
      .from("profiles")
      .select("id, full_name, email, business_name, created_at, onboarded_at")
      .not("onboarded_at", "is", null)
      .order("created_at", { ascending: false }),
    // Every mapping, revoked included: a revoked user is not "pending", they
    // are a decision already made. Re-granting access is a deliberate act on
    // the client's portal page, not a fresh approval.
    service.from("client_users").select("user_id"),
  ]);

  if (error) {
    console.error("getPendingPortalSignups", error.message);
    return [];
  }

  const hasPortal = new Set((mapped ?? []).map((row) => row.user_id));
  const adminEmails = new Set(getAdminEmails().map((e) => e.toLowerCase()));
  const pending = (profiles ?? []).filter(
    (p) =>
      !hasPortal.has(p.id) && !adminEmails.has((p.email ?? "").toLowerCase()),
  );
  if (pending.length === 0) return [];

  // Look up possible existing clients in one query, scoped by RLS to the
  // admin's own clients (the same rows approval is allowed to link to).
  const emails = pending
    .map((p) => normalizeEmail(p.email))
    .filter((e): e is string => Boolean(e));
  const supabase = await createClient();
  const { data: clients } = emails.length
    ? await supabase.from("clients").select("id, company_name, email")
    : { data: [] };

  const byEmail = new Map<string, { id: string; company_name: string }[]>();
  for (const client of clients ?? []) {
    const key = normalizeEmail(client.email);
    if (!key) continue;
    const list = byEmail.get(key) ?? [];
    list.push({ id: client.id, company_name: client.company_name });
    byEmail.set(key, list);
  }

  return pending.map((p) => {
    const key = normalizeEmail(p.email);
    const matches = key ? (byEmail.get(key) ?? []) : [];
    return {
      userId: p.id,
      fullName: p.full_name,
      email: p.email,
      businessName: p.business_name,
      signedUpAt: p.created_at,
      // Exactly one match is a safe reuse; zero or many is not a suggestion.
      matchedClient: matches.length === 1 ? matches[0] : null,
    };
  });
}
