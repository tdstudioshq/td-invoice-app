import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import type { Database } from "@/lib/types/database";

/**
 * Whether the Supabase environment variables are present. The app degrades
 * gracefully (empty states instead of crashes) when they are not, so it can be
 * cloned and built before a database is wired up.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Create a request-scoped Supabase client for use in Server Components, Route
 * Handlers, and Server Actions. Reads/writes auth cookies via next/headers.
 *
 * Non-browser callers (the mobile app hitting an API route) authenticate with a
 * Supabase access token in the `Authorization: Bearer` header instead of auth
 * cookies. When that header is present we forward it as the PostgREST/Storage
 * bearer so every read stays RLS-scoped to that user — anon key + the user's own
 * JWT, no service-role bypass. Browser requests never send this header, so the
 * cookie-based path is unchanged.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const authorization = (await headers()).get("authorization");
  const bearerOptions =
    authorization?.toLowerCase().startsWith("bearer ")
      ? { global: { headers: { Authorization: authorization } } }
      : undefined;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...bearerOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component where cookies are read-only.
            // Safe to ignore when middleware refreshes the session.
          }
        },
      },
    },
  );
}
