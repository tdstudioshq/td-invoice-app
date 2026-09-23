import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type {
  QrCodeRecord,
  QrScan,
} from "@/lib/types/database";

/**
 * QR code + scan analytics reads.
 *
 * Split out of the former lib/data.ts, which had grown to hold nine
 * unrelated domains in one module.
 */

export interface QrScanSummary {
  total: number;
  /** Seven UTC-day buckets, oldest → newest. */
  daily: { date: string; count: number }[];
}

// Seven zero-filled UTC-day buckets ending today, for the scan summary chart.
function buildSevenDayBuckets(): { date: string; count: number }[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const buckets: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setUTCDate(today.getUTCDate() - i);
    buckets.push({ date: day.toISOString().slice(0, 10), count: 0 });
  }
  return buckets;
}

export async function getQrCodes(): Promise<QrCodeRecord[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qr_codes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getQrCodes", error.message);
    return [];
  }
  return data ?? [];
}

export async function getQrCodeById(id: string): Promise<QrCodeRecord | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qr_codes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getQrCodeById", error.message);
    return null;
  }
  return data;
}

/** Total scans per QR code, keyed by id. RLS scopes this to the owner's codes. */
export async function getQrScanCounts(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qr_code_scan_counts")
    .select("qr_code_id, scan_count");
  if (error) {
    console.error("getQrScanCounts", error.message);
    return {};
  }
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.qr_code_id) counts[row.qr_code_id] = Number(row.scan_count ?? 0);
  }
  return counts;
}

export async function getQrScansForQrCode(
  id: string,
  limit = 50,
): Promise<QrScan[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qr_scans")
    .select("*")
    .eq("qr_code_id", id)
    .order("scanned_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getQrScansForQrCode", error.message);
    return [];
  }
  return data ?? [];
}

export async function getQrScanSummary(id: string): Promise<QrScanSummary> {
  const buckets = buildSevenDayBuckets();
  if (!isSupabaseConfigured()) return { total: 0, daily: buckets };
  const supabase = await createClient();

  const { count } = await supabase
    .from("qr_scans")
    .select("*", { count: "exact", head: true })
    .eq("qr_code_id", id);

  const since = `${buckets[0].date}T00:00:00.000Z`;
  const { data, error } = await supabase
    .from("qr_scans")
    .select("scanned_at")
    .eq("qr_code_id", id)
    .gte("scanned_at", since);
  if (error) {
    console.error("getQrScanSummary", error.message);
    return { total: count ?? 0, daily: buckets };
  }

  const index = new Map(buckets.map((bucket, i) => [bucket.date, i]));
  for (const row of data ?? []) {
    const day = row.scanned_at.slice(0, 10);
    const i = index.get(day);
    if (i !== undefined) buckets[i].count += 1;
  }
  return { total: count ?? 0, daily: buckets };
}
