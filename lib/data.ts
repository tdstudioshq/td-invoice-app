import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { effectiveStatus } from "@/lib/invoice";
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
} from "@/lib/types/database";

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
