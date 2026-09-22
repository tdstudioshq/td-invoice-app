import "server-only";
import { createClient } from "@supabase/supabase-js";
// Infrastructure tables have separate migrations from the application type mirror.
export function securityService() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Security backend is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
