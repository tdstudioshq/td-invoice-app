import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type {
  CompanySettings,
} from "@/lib/types/database";

/**
 * Company settings reads.
 *
 * Split out of the former lib/data.ts, which had grown to hold nine
 * unrelated domains in one module.
 */

export async function getCompanySettings(): Promise<CompanySettings | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("getCompanySettings", error.message);
    return null;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Client portals & files
// ---------------------------------------------------------------------------
