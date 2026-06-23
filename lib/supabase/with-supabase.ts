import {
  withSupabase as baseWithSupabase,
  type SupabaseContext,
  type WithSupabaseConfig,
} from "@supabase/server";

import type { Database } from "@/lib/types/database";

/**
 * `@supabase/server` context, typed to our database schema. Inside a route
 * handler, `ctx.supabase` is RLS-scoped and `ctx.supabaseAdmin` bypasses RLS.
 */
export type AppSupabaseContext = SupabaseContext<Database>;

/**
 * Wrapper around `withSupabase` that pins the `Database` generic so
 * `ctx.supabase.from("clients")` etc. are fully typed. The returned value is a
 * `(req: Request) => Promise<Response>` function — exactly the shape of a
 * Next.js App Router Route Handler, so you can `export const GET = supabaseRoute(...)`.
 *
 * Reads SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, and
 * SUPABASE_JWKS_URL from the environment.
 */
export function supabaseRoute(
  config: WithSupabaseConfig,
  handler: (req: Request, ctx: AppSupabaseContext) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return baseWithSupabase<Database>(config, handler);
}
