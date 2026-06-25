import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

/**
 * Whether the service-role credentials needed for admin operations (creating
 * portal users) are present. Kept separate from `isSupabaseConfigured()` because
 * these are server-only secrets, not the public SSR keys.
 */
export function isSupabaseAdminConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

/**
 * A service-role Supabase client that BYPASSES RLS. Use only on the server, only
 * inside admin-guarded Server Actions (after `requireAdmin()`), and only for
 * privileged operations the cookie-scoped client can't do — currently creating
 * client-portal auth users via `auth.admin.createUser`.
 *
 * Never import this into a Client Component or expose its results unfiltered.
 */
export function createAdminClient() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "Supabase admin client is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY).",
    );
  }
  return createSupabaseClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
