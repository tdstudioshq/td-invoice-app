import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type {
  InvoiceWithClient,
  InvoiceWithPayments,
  InvoiceWithRelations,
} from "@/lib/types/database";

/**
 * Invoice reads.
 *
 * Split out of the former lib/data.ts, which had grown to hold nine
 * unrelated domains in one module.
 */

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

const WITH_PAYMENTS = "*, payments(id, amount, kind, payment_date)";

/**
 * The invoices billing one partner job, oldest first.
 *
 * Shared by the studio and the partner portal on purpose: RLS decides what each
 * sees — the owner-scoped policies give the studio every invoice on the job, and
 * `invoices_partner_select` (20260926120000) gives a rep only the non-draft ones
 * on their own company's jobs. There is no role check here to drift from that.
 */
export async function getInvoicesForJob(
  jobId: string,
): Promise<InvoiceWithPayments[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(WITH_PAYMENTS)
    .eq("design_job_id", jobId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getInvoicesForJob", error.message);
    return [];
  }
  return (data ?? []) as unknown as InvoiceWithPayments[];
}

/**
 * Every job-linked invoice the caller can see, newest first. Called from the
 * partner portal, where RLS limits it to the rep's own company.
 */
export async function getJobLinkedInvoices(): Promise<InvoiceWithPayments[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(WITH_PAYMENTS)
    .not("design_job_id", "is", null)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getJobLinkedInvoices", error.message);
    return [];
  }
  return (data ?? []) as unknown as InvoiceWithPayments[];
}
