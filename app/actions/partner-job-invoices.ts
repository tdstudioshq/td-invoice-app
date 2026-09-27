"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { OWNER_RESOLVE_ERROR, currentOwnerId, requireAdmin } from "@/lib/auth";
import { ensurePartnerCompanyClient } from "@/lib/partner-jobs/invoicing";
import { getPartnerJobInvoiceContext } from "@/lib/partner-jobs/queries";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ActionState } from "@/app/actions/types";

/**
 * Attaching existing invoices to partner jobs, and detaching them. Admin-only,
 * and kept out of the partner action files so a rep's bundle never references
 * it (the same split as admin-partner-jobs.ts).
 *
 * The invoice write goes through the COOKIE-SCOPED client, so the owner-scoped
 * RLS on `invoices` still decides which invoices the studio may touch — the
 * service role is used only to read the job and its company (inside
 * getPartnerJobInvoiceContext), which have no admin policy.
 */

const linkSchema = z.object({
  jobId: z.string().uuid(),
  invoiceId: z.string().uuid({ message: "Choose an invoice." }),
});

function revalidateJob(jobId: string, invoiceId: string) {
  revalidatePath(`/partner-jobs/${jobId}`);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

export async function linkInvoiceToJobAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };

  const parsed = linkSchema.safeParse({
    jobId: formData.get("job_id"),
    invoiceId: formData.get("invoice_id"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Choose an invoice." };
  }
  const { jobId, invoiceId } = parsed.data;

  const context = await getPartnerJobInvoiceContext(jobId);
  if (!context) return { error: "That job no longer exists." };
  if (!context.company.invoices_enabled) {
    return { error: `Invoices aren't turned on for ${context.company.name}.` };
  }

  const supabase = await createClient();
  const ownerId = await currentOwnerId(supabase);
  if (!ownerId) return { error: OWNER_RESOLVE_ERROR };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, client_id, design_job_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice) return { error: "That invoice couldn't be found." };
  if (invoice.design_job_id && invoice.design_job_id !== jobId) {
    return { error: "That invoice is already attached to another job." };
  }

  const resolved = await ensurePartnerCompanyClient(context, supabase, ownerId);
  if ("error" in resolved) return { error: resolved.error };
  // The portal shows the invoice to the company, so it must bill that company.
  // A client-less invoice adopts it; one billed to somebody else is refused.
  if (invoice.client_id && invoice.client_id !== resolved.clientId) {
    return {
      error: `That invoice is billed to a different client, not ${context.company.name}.`,
    };
  }

  const { error } = await supabase
    .from("invoices")
    .update({ design_job_id: jobId, client_id: resolved.clientId })
    .eq("id", invoiceId);
  if (error) {
    console.error("linkInvoiceToJobAction", error.message);
    return { error: "Couldn't attach that invoice. Try again." };
  }

  revalidateJob(jobId, invoiceId);
  return { success: true };
}

const unlinkSchema = z.object({
  jobId: z.string().uuid(),
  invoiceId: z.string().uuid(),
});

export async function unlinkInvoiceFromJobAction(formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isSupabaseConfigured()) return;

  const parsed = unlinkSchema.safeParse({
    jobId: formData.get("job_id"),
    invoiceId: formData.get("invoice_id"),
  });
  if (!parsed.success) return;
  const { jobId, invoiceId } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ design_job_id: null })
    .eq("id", invoiceId)
    .eq("design_job_id", jobId);
  if (error) console.error("unlinkInvoiceFromJobAction", error.message);

  revalidateJob(jobId, invoiceId);
}
