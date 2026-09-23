import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type {
  Client,
} from "@/lib/types/database";

/**
 * Client reads.
 *
 * Split out of the former lib/data.ts, which had grown to hold nine
 * unrelated domains in one module.
 */

// All read helpers return safe fallbacks when Supabase isn't configured yet,
// so the UI renders empty states instead of crashing during local setup.

export async function getClients(): Promise<Client[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("company_name", { ascending: true });
  if (error) {
    console.error("getClients", error.message);
    return [];
  }
  return data ?? [];
}

export async function getClient(id: string): Promise<Client | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getClient", error.message);
    return null;
  }
  return data;
}
