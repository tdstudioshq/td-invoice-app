import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type {
  InvoiceWithClient,
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
