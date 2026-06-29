import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { effectiveStatus } from "@/lib/invoice";
import {
  categorizeImage,
  isImageFile,
  PORTFOLIO_BUCKET,
  prettifyName,
  type PortfolioImage,
} from "@/lib/portfolio";
import type {
  Client,
  ClientFile,
  ClientFileFolder,
  ClientPortalSummary,
  ClientUser,
  CompanySettings,
  FileActivity,
  InvoiceWithClient,
  InvoiceWithRelations,
  Lead,
  QrCodeRecord,
  QrScan,
} from "@/lib/types/database";

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

export async function getInvoices(): Promise<InvoiceWithClient[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, client:clients(id, company_name, contact_name, email)",
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getInvoices", error.message);
    return [];
  }
  return (data ?? []) as unknown as InvoiceWithClient[];
}

export async function getInvoice(
  id: string,
): Promise<InvoiceWithRelations | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, client:clients(*), invoice_items(*), payments(*)",
    )
    .eq("id", id)
    .order("position", { referencedTable: "invoice_items", ascending: true })
    .maybeSingle();
  if (error) {
    console.error("getInvoice", error.message);
    return null;
  }
  return data as unknown as InvoiceWithRelations | null;
}

export async function getInvoicesForClient(
  clientId: string,
): Promise<InvoiceWithClient[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, client:clients(id, company_name, contact_name, email)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getInvoicesForClient", error.message);
    return [];
  }
  return (data ?? []) as unknown as InvoiceWithClient[];
}

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
// Leads
// ---------------------------------------------------------------------------

export interface LeadsPageData {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getLeads({
  query = "",
  page = 1,
  pageSize = 50,
}: {
  query?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<LeadsPageData> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));

  if (!isSupabaseConfigured()) {
    return { leads: [], total: 0, page: safePage, pageSize: safePageSize };
  }

  const supabase = await createClient();
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let request = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .order("username", { ascending: true })
    .range(from, to);

  const search = query.replace(/[,%()]/g, " ").trim();
  if (search) {
    request = request.or(
      `username.ilike.%${search}%,full_name.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await request;
  if (error) {
    console.error("getLeads", error.message);
    return { leads: [], total: 0, page: safePage, pageSize: safePageSize };
  }

  return {
    leads: data ?? [],
    total: count ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };
}

// ---------------------------------------------------------------------------
// Client portals & files
// ---------------------------------------------------------------------------

/**
 * One row per client with its portal-access state and file count, for the admin
 * /client-portals list. RLS scopes every query to the current admin's workspace.
 */
export async function getClientPortalSummaries(): Promise<
  ClientPortalSummary[]
> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const [clientsRes, usersRes, filesRes] = await Promise.all([
    supabase.from("clients").select("*").order("company_name"),
    supabase.from("client_users").select("*").is("revoked_at", null),
    supabase.from("client_files").select("client_id"),
  ]);

  if (clientsRes.error) {
    console.error("getClientPortalSummaries", clientsRes.error.message);
    return [];
  }

  const usersByClient = new Map<string, ClientUser>();
  for (const u of usersRes.data ?? []) usersByClient.set(u.client_id, u);

  const fileCounts = new Map<string, number>();
  for (const f of filesRes.data ?? [])
    fileCounts.set(f.client_id, (fileCounts.get(f.client_id) ?? 0) + 1);

  return (clientsRes.data ?? []).map((client) => ({
    ...client,
    portal_user: usersByClient.get(client.id) ?? null,
    file_count: fileCounts.get(client.id) ?? 0,
  }));
}

/** The active portal user mapped to a client, or null. Admin-scoped via RLS. */
export async function getPortalUserForClient(
  clientId: string,
): Promise<ClientUser | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_users")
    .select("*")
    .eq("client_id", clientId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) {
    console.error("getPortalUserForClient", error.message);
    return null;
  }
  return data;
}

/** Files for a client. RLS returns admin-owned files or the portal user's own. */
export async function getClientFiles(clientId: string): Promise<ClientFile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_files")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getClientFiles", error.message);
    return [];
  }
  return data ?? [];
}

/** Folders for a client. RLS-scoped. */
export async function getClientFolders(
  clientId: string,
): Promise<ClientFileFolder[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_file_folders")
    .select("*")
    .eq("client_id", clientId)
    .order("name", { ascending: true });
  if (error) {
    console.error("getClientFolders", error.message);
    return [];
  }
  return data ?? [];
}

/** Recent file activity for a client (admin-only via RLS). */
export async function getFileActivity(
  clientId: string,
  limit = 20,
): Promise<FileActivity[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("file_activity")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getFileActivity", error.message);
    return [];
  }
  return data ?? [];
}

export interface DashboardStats {
  totalInvoiced: number;
  totalPaid: number;
  outstanding: number;
  overdueCount: number;
  overdueAmount: number;
  invoiceCount: number;
}

export async function getDashboardStats(
  invoices: InvoiceWithClient[],
): Promise<DashboardStats> {
  let totalInvoiced = 0;
  let totalPaid = 0;
  let outstanding = 0;
  let overdueCount = 0;
  let overdueAmount = 0;

  for (const invoice of invoices) {
    // Drafts are not yet "invoiced" revenue.
    if (invoice.status === "draft") continue;

    const total = Number(invoice.total);
    totalInvoiced += total;

    if (invoice.status === "paid") {
      totalPaid += total;
    } else {
      outstanding += total;
      if (effectiveStatus(invoice) === "overdue") {
        overdueCount += 1;
        overdueAmount += total;
      }
    }
  }

  return {
    totalInvoiced,
    totalPaid,
    outstanding,
    overdueCount,
    overdueAmount,
    invoiceCount: invoices.length,
  };
}

// ---------------------------------------------------------------------------
// Portfolio Gallery (public)
// ---------------------------------------------------------------------------

/**
 * List every image in the public `custom-work` bucket and resolve each to a
 * public URL + derived category. Paginates so the count can grow past Storage's
 * 100-per-list cap with no code change — the `/portfolio` page is
 * `force-dynamic`, so newly uploaded files appear on the next request.
 *
 * Listing `storage.objects` is gated by RLS even for a *public* bucket (public
 * only affects object downloads, not `list()`), so we prefer the service-role
 * client to guarantee the list resolves without a bespoke SELECT policy. This is
 * safe: it runs server-only and returns nothing but public filenames + URLs from
 * an already-public bucket. Falls back to the cookie client, then to an empty
 * array when Supabase isn't configured (graceful-degradation pattern).
 */
export async function getPortfolioImages(): Promise<PortfolioImage[]> {
  const storage = isSupabaseAdminConfigured()
    ? createAdminClient().storage
    : isSupabaseConfigured()
      ? (await createClient()).storage
      : null;
  if (!storage) return [];

  const images: PortfolioImage[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await storage.from(PORTFOLIO_BUCKET).list("", {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.error("getPortfolioImages", error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const object of data) {
      // Skip folder placeholders (id is null) and non-image objects.
      if (!object.id || !isImageFile(object.name)) continue;
      const path = object.name;
      const { data: pub } = storage
        .from(PORTFOLIO_BUCKET)
        .getPublicUrl(path);
      images.push({
        id: path,
        name: object.name,
        title: prettifyName(object.name),
        path,
        url: pub.publicUrl,
        category: categorizeImage(path),
      });
    }

    if (data.length < pageSize) break;
  }

  return images;
}
