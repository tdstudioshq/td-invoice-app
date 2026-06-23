"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ActionState } from "@/app/actions/types";
import type { InvoiceStatus } from "@/lib/types/database";

const itemSchema = z.object({
  description: z.string().trim().default(""),
  quantity: z.coerce.number().min(0).default(1),
  unit_price: z.coerce.number().min(0).default(0),
});

const invoiceSchema = z.object({
  client_name: z.string().trim().min(1, "Client name is required"),
  status: z.enum(["draft", "sent", "paid", "overdue"]),
  issue_date: z.string().min(1, "Issue date is required"),
  due_date: z.string().optional().or(z.literal("")),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  discount_rate: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().trim().optional().or(z.literal("")),
  items: z.array(itemSchema).min(1, "Add at least one line item"),
});

function parseInvoice(formData: FormData) {
  let items: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    items = [];
  }

  return invoiceSchema.safeParse({
    client_name: formData.get("client_name") || "",
    status: formData.get("status") || "draft",
    issue_date: formData.get("issue_date") || "",
    due_date: formData.get("due_date") || "",
    tax_rate: formData.get("tax_rate") ?? 0,
    discount_rate: formData.get("discount_rate") ?? 0,
    notes: formData.get("notes") || "",
    items,
  });
}

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function buildInvoiceRow(
  data: z.infer<typeof invoiceSchema>,
  clientId: string | null,
) {
  return {
    client_id: clientId,
    status: data.status as InvoiceStatus,
    issue_date: data.issue_date,
    due_date: data.due_date ? data.due_date : null,
    tax_rate: data.tax_rate,
    discount_rate: data.discount_rate,
    notes: data.notes ? String(data.notes).trim() : null,
  };
}

/**
 * Resolve a typed client name to a client id: reuse an existing client
 * (case-insensitive exact match) or create a new one on the fly.
 */
async function resolveClientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
): Promise<{ id: string | null; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { id: null };

  const { data: existing } = await supabase
    .from("clients")
    .select("id")
    .ilike("company_name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data: created, error } = await supabase
    .from("clients")
    .insert({ company_name: trimmed })
    .select("id")
    .single();
  if (error || !created) {
    return { id: null, error: error?.message ?? "Could not save client" };
  }
  return { id: created.id };
}

function buildItemRows(
  invoiceId: string,
  items: z.infer<typeof itemSchema>[],
) {
  return items
    .filter((item) => item.description.trim() !== "" || item.unit_price > 0)
    .map((item, index) => ({
      invoice_id: invoiceId,
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unit_price,
      position: index,
    }));
}

export async function createInvoiceAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseInvoice(formData);
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const supabase = await createClient();

  const client = await resolveClientId(supabase, parsed.data.client_name);
  if (client.error) return { error: client.error };

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert(buildInvoiceRow(parsed.data, client.id))
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return { error: invoiceError?.message ?? "Could not create invoice" };
  }

  const itemRows = buildItemRows(invoice.id, parsed.data.items);
  if (itemRows.length > 0) {
    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(itemRows);
    if (itemsError) return { error: itemsError.message };
  }

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect(`/invoices/${invoice.id}`);
}

export async function updateInvoiceAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseInvoice(formData);
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const supabase = await createClient();

  const client = await resolveClientId(supabase, parsed.data.client_name);
  if (client.error) return { error: client.error };

  const { error: invoiceError } = await supabase
    .from("invoices")
    .update(buildInvoiceRow(parsed.data, client.id))
    .eq("id", id);
  if (invoiceError) return { error: invoiceError.message };

  // Replace line items wholesale — simplest correct approach for an edit form.
  const { error: deleteError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", id);
  if (deleteError) return { error: deleteError.message };

  const itemRows = buildItemRows(id, parsed.data.items);
  if (itemRows.length > 0) {
    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(itemRows);
    if (itemsError) return { error: itemsError.message };
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
  redirect(`/invoices/${id}`);
}

export async function updateInvoiceStatusAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as InvoiceStatus;
  const valid: InvoiceStatus[] = ["draft", "sent", "paid", "overdue"];
  if (!id || !valid.includes(status) || !isSupabaseConfigured()) return;

  const supabase = await createClient();
  await supabase.from("invoices").update({ status }).eq("id", id);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/dashboard");
}

export async function deleteInvoiceAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !isSupabaseConfigured()) return;

  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", id);

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect("/invoices");
}

// TODO(stripe): addPaymentAction — record a Stripe payment against an invoice
// and flip status to "paid" once the balance is settled.
// TODO(resend): sendInvoiceAction — email the invoice PDF/link to the client
// via Resend, then set status to "sent".
