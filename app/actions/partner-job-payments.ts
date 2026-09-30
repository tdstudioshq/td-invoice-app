"use server";

import { revalidatePath } from "next/cache";

import { getPartnerContext, partnerHomePath } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { NOT_A_PARTNER, NOT_CONFIGURED } from "@/lib/partner-jobs/action-constants";
import { getPartnerCompanyBySlug } from "@/lib/partner-jobs/context";
import { recordPartnerJobEvent } from "@/lib/partner-jobs/events";
import { deleteJobPaymentSchema, jobPaymentSchema } from "@/lib/partner-jobs/schema";
import { JOB_PAYMENT_METHOD_LABEL } from "@/lib/partner-jobs/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ActionState } from "@/app/actions/types";

/**
 * The REP's half of the job payment log (migration 20260930024624): record a
 * payment, and remove one they recorded.
 *
 * Cookie-scoped throughout, so RLS is the authorization: the insert's derived
 * company must be the caller's, and the delete policy only matches rows a rep
 * recorded — a studio entry, or another company's, comes back as zero rows and
 * reads as "couldn't be found". The studio's half is
 * app/actions/admin-partner-job-payments.ts, kept apart so this bundle never
 * references an admin endpoint.
 *
 * One recordPartnerJobEvent() per action, like every partner write.
 */

const PAYMENTS_OFF = "Payments aren't turned on for this portal.";

async function paymentsEnabled(companySlug: string): Promise<boolean> {
  const company = await getPartnerCompanyBySlug(companySlug);
  return Boolean(company?.invoices_enabled);
}

function revalidateJob(companySlug: string, jobId: string) {
  revalidatePath(`${partnerHomePath(companySlug)}/${jobId}`);
  revalidatePath(`/partner-jobs/${jobId}`);
}

export async function recordPartnerJobPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };
  const partner = await getPartnerContext();
  if (!partner) return { error: NOT_A_PARTNER };
  if (!(await paymentsEnabled(partner.companySlug))) return { error: PAYMENTS_OFF };

  const parsed = jobPaymentSchema.safeParse({
    jobId: formData.get("job_id"),
    amount: formData.get("amount") ?? "",
    paidOn: formData.get("paid_on") ?? "",
    method: formData.get("method") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Check the highlighted fields.", fieldErrors };
  }
  const payment = parsed.data;

  const supabase = await createClient();
  const { data: job } = await supabase
    .from("design_jobs")
    .select("id, job_number, job_name")
    .eq("id", payment.jobId)
    .maybeSingle();
  if (!job) return { error: "That job couldn't be found." };

  // company_id and the recorder are derived by the table's trigger.
  const { error } = await supabase.from("design_job_payments").insert({
    job_id: job.id,
    amount: payment.amount,
    paid_on: payment.paidOn,
    method: payment.method,
    note: payment.note,
  });
  if (error) {
    console.error("recordPartnerJobPaymentAction", error.code, error.message);
    return { error: "We couldn't record that payment. Try again." };
  }

  await recordPartnerJobEvent({
    jobId: job.id,
    jobNumber: job.job_number,
    jobName: job.job_name,
    companyId: partner.companyId,
    companyName: partner.companyName,
    eventType: "payment.recorded",
    actor: { kind: "partner" },
    actorDisplay: partner.displayName ?? partner.companyName,
    summary: `${formatCurrency(payment.amount)} by ${JOB_PAYMENT_METHOD_LABEL[payment.method]}`,
    metadata: {
      amount: formatCurrency(payment.amount),
      method: JOB_PAYMENT_METHOD_LABEL[payment.method],
      paidOn: formatDate(payment.paidOn),
      note: payment.note,
    },
  });

  revalidateJob(partner.companySlug, job.id);
  return { success: true };
}

export async function deletePartnerJobPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };
  const partner = await getPartnerContext();
  if (!partner) return { error: NOT_A_PARTNER };

  const parsed = deleteJobPaymentSchema.safeParse({
    jobId: formData.get("job_id"),
    paymentId: formData.get("payment_id"),
  });
  if (!parsed.success) return { error: "That payment couldn't be found." };
  const { jobId, paymentId } = parsed.data;

  const supabase = await createClient();
  const { data: removed, error } = await supabase
    .from("design_job_payments")
    .delete()
    .eq("id", paymentId)
    .eq("job_id", jobId)
    .select("amount, method");
  if (error) {
    console.error("deletePartnerJobPaymentAction", error.message);
    return { error: "We couldn't remove that payment. Try again." };
  }
  // The policy returns no rows for a studio entry or another company's.
  if (!removed || removed.length === 0) {
    return { error: "Only payments your team recorded can be removed here." };
  }

  const { data: job } = await supabase
    .from("design_jobs")
    .select("job_number, job_name")
    .eq("id", jobId)
    .maybeSingle();
  if (job) {
    const amount = formatCurrency(Number(removed[0].amount));
    await recordPartnerJobEvent({
      jobId,
      jobNumber: job.job_number,
      jobName: job.job_name,
      companyId: partner.companyId,
      companyName: partner.companyName,
      eventType: "payment.removed",
      actor: { kind: "partner" },
      actorDisplay: partner.displayName ?? partner.companyName,
      summary: `${amount} by ${JOB_PAYMENT_METHOD_LABEL[removed[0].method]}`,
      metadata: { amount, method: JOB_PAYMENT_METHOD_LABEL[removed[0].method] },
    });
  }

  revalidateJob(partner.companySlug, jobId);
  return { success: true };
}
