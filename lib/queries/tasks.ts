import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type {
  TaskWithClient,
} from "@/lib/types/database";

/**
 * Dashboard task reads.
 *
 * Split out of the former lib/data.ts, which had grown to hold nine
 * unrelated domains in one module.
 */

export async function getTasks(): Promise<TaskWithClient[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*, client:clients(id, company_name)")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getTasks", error.message);
    return [];
  }
  return (data ?? []) as unknown as TaskWithClient[];
}
