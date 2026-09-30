"use server";

import { revalidatePath } from "next/cache";

import { partnerHomePath, requireAdmin } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { recordPartnerJobEvent } from "@/lib/partner-jobs/events";
import { deleteJobPaymentSchema, jobPaymentSchema } from "@/lib/partner-jobs/schema";
import { JOB_PAYMENT_METHOD_LABEL } from "@/lib/partner-jobs/types";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import type { ActionState } from "@/app/actions/types";

/**
 * The STUDIO's half of the job payment log (migration 20260930024624).
 *
 * Service role behind requireAdmin(), like every admin write to the partner
 * tables — they are company-scoped with no owner_id, so there is no admin
 * policy to write through. The studio may record a payment on any job and
 * remove any entry, including one a rep recorded (a rep may only remove their
 * own). Rows written here carry `recorded_by_studio`, which is what stops a rep
 * deleting them. One studio-actor event per action.
 */

const NOT_CONFIGURED = "Supabase admin access is not configured.";
const STUDIO = "TD Studios";

async function loadJob(jobId: string) {
  const supabase = createAdminClient();
  const { data: job } = await supabase
    .from("design_jobs")
    .select("id, job_number, job_name, company_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;
  const { data: company } = await supabase
    .from("partner_companies")
    .select("id, name, slug, invoices_enabled")
    .eq("id", job.company_id)
    .maybeSingle();
  if (!company) return null;
  return { job, company };
}

function revalidateJob(companySlug: string, jobId: string) {
  revalidatePath(`/partner-jobs/${jobId}`);
  revalidatePath(`${partnerHomePath(companySlug)}/${jobId}`);
}

export async function recordStudioJobPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!isSupabaseAdminConfigured()) return { error: NOT_CONFIGURED };

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

  const loaded = await loadJob(payment.jobId);
  if (!loaded) return { error: "That job no longer exists." };
  const { job, company } = loaded;
  if (!company.invoices_enabled) {
    return { error: `Payments aren't turned on for ${company.name}.` };
  }

  const { error } = await createAdminClient().from("design_job_payments").insert({
    job_id: job.id,
    amount: payment.amount,
    paid_on: payment.paidOn,
    method: payment.method,
    note: payment.note,
    // Attribution, not ownership: which admin recorded it.
    recorded_by: user?.id ?? null,
    recorded_by_studio: true,
  });
  if (error) {
    console.error("recordStudioJobPaymentAction", error.code, error.message);
    return { error: "Couldn't record that payment. Try again." };
  }

  await recordPartnerJobEvent({
    jobId: job.id,
    jobNumber: job.job_number,
    jobName: job.job_name,
    companyId: company.id,
    companyName: company.name,
    eventType: "payment.recorded",
    actor: { kind: "studio", label: STUDIO },
    actorDisplay: STUDIO,
    summary: `${formatCurrency(payment.amount)} by ${JOB_PAYMENT_METHOD_LABEL[payment.method]}`,
    metadata: {
      amount: formatCurrency(payment.amount),
      method: JOB_PAYMENT_METHOD_LABEL[payment.method],
      paidOn: formatDate(payment.paidOn),
      note: payment.note,
    },
  });

  revalidateJob(company.slug, job.id);
  return { success: true };
}

export async function deleteStudioJobPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  if (!isSupabaseAdminConfigured()) return { error: NOT_CONFIGURED };

  const parsed = deleteJobPaymentSchema.safeParse({
    jobId: formData.get("job_id"),
    paymentId: formData.get("payment_id"),
  });
  if (!parsed.success) return { error: "That payment couldn't be found." };
  const { jobId, paymentId } = parsed.data;

  const loaded = await loadJob(jobId);
  if (!loaded) return { error: "That job no longer exists." };
  const { job, company } = loaded;

  const { data: removed, error } = await createAdminClient()
    .from("design_job_payments")
    .delete()
    .eq("id", paymentId)
    .eq("job_id", jobId)
    .select("amount, method");
  if (error) {
    console.error("deleteStudioJobPaymentAction", error.message);
    return { error: "Couldn't remove that payment. Try again." };
  }
  if (!removed || removed.length === 0) return { error: "That payment couldn't be found." };

  const amount = formatCurrency(Number(removed[0].amount));
  await recordPartnerJobEvent({
    jobId: job.id,
    jobNumber: job.job_number,
    jobName: job.job_name,
    companyId: company.id,
    companyName: company.name,
    eventType: "payment.removed",
    actor: { kind: "studio", label: STUDIO },
    actorDisplay: STUDIO,
    summary: `${amount} by ${JOB_PAYMENT_METHOD_LABEL[removed[0].method]}`,
    metadata: { amount, method: JOB_PAYMENT_METHOD_LABEL[removed[0].method] },
  });

  revalidateJob(company.slug, job.id);
  return { success: true };
}
