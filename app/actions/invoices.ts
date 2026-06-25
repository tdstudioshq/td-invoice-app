"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getCompanySettings, getInvoice } from "@/lib/data";
import { buildInvoicePdfData } from "@/lib/pdf/invoice-pdf-data";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";
import { EMAIL_FROM, getResend, isResendConfigured } from "@/lib/email/client";
import { invoiceEmail } from "@/lib/email/templates";
import { formatCurrency, formatDate } from "@/lib/format";
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
  ownerId?: string,
) {
  return {
    ...(ownerId ? { owner_id: ownerId } : {}),
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
  ownerId: string,
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
    .insert({ company_name: trimmed, owner_id: ownerId })
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
  ownerId: string,
) {
  return items
    .filter((item) => item.description.trim() !== "" || item.unit_price > 0)
    .map((item, index) => ({
      invoice_id: invoiceId,
      owner_id: ownerId,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const client = await resolveClientId(supabase, parsed.data.client_name, user.id);
  if (client.error) return { error: client.error };

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert(buildInvoiceRow(parsed.data, client.id, user.id))
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return { error: invoiceError?.message ?? "Could not create invoice" };
  }

  const itemRows = buildItemRows(invoice.id, parsed.data.items, user.id);
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const client = await resolveClientId(supabase, parsed.data.client_name, user.id);
  if (client.error) return { error: client.error };

  // owner_id intentionally omitted on update; RLS scopes this to the owner.
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

  const itemRows = buildItemRows(id, parsed.data.items, user.id);
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

const paymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  payment_date: z.string().min(1, "Date is required"),
  method: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

// Record a payment against an invoice. When total payments cover the invoice
// total, the invoice is automatically marked "paid".
// TODO(stripe): also create payments automatically from Stripe webhooks.
export async function addPaymentAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = paymentSchema.safeParse({
    invoice_id: formData.get("invoice_id"),
    amount: formData.get("amount"),
    payment_date: formData.get("payment_date"),
    method: formData.get("method"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { invoice_id } = parsed.data;

  const { error } = await supabase.from("payments").insert({
    invoice_id,
    owner_id: user.id,
    amount: parsed.data.amount,
    payment_date: parsed.data.payment_date,
    method: parsed.data.method ? parsed.data.method.trim() : null,
    notes: parsed.data.notes ? parsed.data.notes.trim() : null,
  });
  if (error) return { error: error.message };

  // Auto-mark the invoice paid once payments cover the total.
  const [{ data: invoice }, { data: payments }] = await Promise.all([
    supabase.from("invoices").select("total, status").eq("id", invoice_id).single(),
    supabase.from("payments").select("amount").eq("invoice_id", invoice_id),
  ]);
  const totalPaid = (payments ?? []).reduce(
    (sum, p) => sum + Number(p.amount),
    0,
  );
  if (invoice && invoice.status !== "paid" && totalPaid >= Number(invoice.total)) {
    await supabase.from("invoices").update({ status: "paid" }).eq("id", invoice_id);
  }

  revalidatePath(`/invoices/${invoice_id}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { success: true };
}

// Email the invoice (as a PDF attachment) to the client via Resend, then move a
// draft invoice to "sent". Degrades gracefully when email isn't configured.
export async function sendInvoiceAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing invoice." };
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }
  if (!isResendConfigured()) {
    return {
      error:
        "Email isn't configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL. See README.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  // RLS scopes getInvoice to the owner; a foreign id returns null → not found.
  const invoice = await getInvoice(id);
  if (!invoice) return { error: "Invoice not found." };

  const to = invoice.client?.email?.trim();
  if (!to) {
    return {
      error: "This client has no email address. Add one on the client first.",
    };
  }

  const settings = await getCompanySettings();
  const companyName = settings?.company_name ?? "TD Studios";
  const pdf = await renderInvoicePdf(buildInvoicePdfData(invoice, settings));
  const email = invoiceEmail({
    companyName,
    clientName: invoice.client?.company_name ?? "there",
    invoiceNumber: invoice.invoice_number,
    formattedTotal: formatCurrency(invoice.total),
    dueDate: formatDate(invoice.due_date),
  });

  try {
    const { error: sendError } = await getResend().emails.send({
      from: EMAIL_FROM,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [
        { filename: `${invoice.invoice_number}.pdf`, content: Buffer.from(pdf) },
      ],
    });
    if (sendError) {
      return { error: sendError.message ?? "Could not send the email." };
    }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not send the email.",
    };
  }

  // Promote a draft to "sent"; never downgrade a sent/paid invoice.
  if (invoice.status === "draft") {
    await supabase.from("invoices").update({ status: "sent" }).eq("id", id);
  }

  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { success: true, data: { email: to } };
}
