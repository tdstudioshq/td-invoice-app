import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";

/**
 * Create a Supabase client for use in Client Components ("use client").
 * Uses the public anon key, which is safe to expose to the browser.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
