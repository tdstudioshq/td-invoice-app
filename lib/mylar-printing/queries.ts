import "server-only";

import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import type { MylarPrintingInquiry } from "@/lib/types/database";

/**
 * Admin-side reads for mylar printing inquiries.
 *
 * These go through the SERVICE-ROLE client because the table has RLS on with no
 * policies (migration 0023) — inquiries have no owner_id to scope to, since
 * they're filed by anonymous visitors, so the cookie-scoped client sees exactly
 * nothing. Same shape as the qr_generations read on /qr/history.
 *
 * Callers are responsible for `requireAdmin()`. Every current caller is inside
 * the (app) route group, whose layout already enforces it, and re-asserts it
 * locally. Nothing here is safe to expose to a client component.
 */

const LIST_LIMIT = 200;

export async function getMylarInquiries(): Promise<MylarPrintingInquiry[]> {
  if (!isSupabaseAdminConfigured()) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("mylar_printing_inquiries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (error) {
      console.error("getMylarInquiries", error.message);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error("getMylarInquiries", error);
    return [];
  }
}

export async function getMylarInquiry(
  id: string,
): Promise<MylarPrintingInquiry | null> {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("mylar_printing_inquiries")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("getMylarInquiry", error.message);
      return null;
    }
    return data;
  } catch (error) {
    console.error("getMylarInquiry", error);
    return null;
  }
}
