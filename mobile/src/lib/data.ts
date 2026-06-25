import { supabase } from "@/src/lib/supabase";
import type {
  Client,
  ClientFile,
  ClientFileFolder,
  CompanySettings,
  InvoiceWithClient,
  InvoiceWithRelations,
} from "@/src/types/database";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function getClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("company_name");
  throwIfError(error);
  return data ?? [];
}

export async function getClient(id: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfError(error);
  return data;
}

export async function getInvoices(): Promise<InvoiceWithClient[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, client:clients(id, company_name, contact_name, email)")
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as unknown as InvoiceWithClient[];
}

export async function getInvoicesForClient(
  clientId: string,
): Promise<InvoiceWithClient[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, client:clients(id, company_name, contact_name, email)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as unknown as InvoiceWithClient[];
}

export async function getInvoice(
  id: string,
): Promise<InvoiceWithRelations | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*, client:clients(*), invoice_items(*), payments(*)")
    .eq("id", id)
    .order("position", { referencedTable: "invoice_items" })
    .maybeSingle();
  throwIfError(error);
  return data as unknown as InvoiceWithRelations | null;
}

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  throwIfError(error);
  return data;
}

export async function getClientFiles(clientId: string): Promise<ClientFile[]> {
  const { data, error } = await supabase
    .from("client_files")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return data ?? [];
}

export async function getClientFolders(
  clientId: string,
): Promise<ClientFileFolder[]> {
  const { data, error } = await supabase
    .from("client_file_folders")
    .select("*")
    .eq("client_id", clientId)
    .order("name");
  throwIfError(error);
  return data ?? [];
}

export async function createFileDownloadUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from("client-files")
    .createSignedUrl(storagePath, 60);
  throwIfError(error);
  if (!data) throw new Error("Supabase did not return a file URL.");
  return data.signedUrl;
}
