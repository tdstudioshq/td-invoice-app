"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { recordPartnerJobEvent } from "@/lib/partner-jobs/events";
import {
  DESIGN_JOB_STATUSES,
  DESIGN_JOB_STATUS_LABEL,
  JOB_INCOMPLETE_STATUS,
  type DesignJobStatus,
} from "@/lib/partner-jobs/types";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import type { ActionState } from "@/app/actions/types";

/**
 * Admin-side writes for partner jobs. Kept out of app/actions/partner-jobs.ts so
 * the partner portal's bundle never references an admin-only endpoint — the same
 * split as mylar-printing / mylar-requests and design-requests /
 * custom-design-requests.
 *
 * The service-role client is required here rather than convenient: partner
 * tables carry no `owner_id`, so there is no admin policy to write through, and
 * a database trigger forces `status` back for any caller with an auth.uid()
 * (which is what makes "a rep cannot change job status" a database invariant —
 * the service role has no auth.uid(), which is exactly how this gets through).
 * `requireAdmin()` is therefore the only thing between a caller and a privileged
 * write, and it runs first — before anything is parsed or touched.
 *
 * TWO CONTROLS, ONE WRITE PATH. The Status dropdown on a job's detail page and
 * the Complete checkbox on the list both go through `applyPartnerJobStatus()`.
 * That is not tidiness: the status write also revalidates four routes and emits
 * the `job.status_changed` event the studio is notified from, and a second
 * implementation would inevitably drift out of step with one of them.
 */

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(
    DESIGN_JOB_STATUSES as unknown as [DesignJobStatus, ...DesignJobStatus[]],
  ),
});

/**
 * Move one job to `status`, revalidate everywhere it is rendered, and emit the
 * event the studio's notification is dispatched from.
 *
 * Not exported as a server action — it is the shared body of the two that are,
 * so each of them re-asserts `requireAdmin()` itself before calling in.
 */
async function applyPartnerJobStatus(
  id: string,
  status: DesignJobStatus,
): Promise<ActionState> {
  const supabase = createAdminClient();

  // Read the OLD status first: "New -> In Progress" is the whole content of the
  // notification, and an UPDATE cannot return the value it just overwrote.
  const { data: before } = await supabase
    .from("design_jobs")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("design_jobs")
    .update({ status })
    .eq("id", id)
    .select("id, company_id, job_number, job_name")
    .maybeSingle();

  if (error) {
    console.error("applyPartnerJobStatus", error.message);
    return { error: "Could not update the status." };
  }
  if (!data) return { error: "That job no longer exists." };

  revalidatePath("/partner-jobs");
  revalidatePath(`/partner-jobs/${id}`);
  // The rep's own dashboard renders the same status; the portal is reached at
  // several URLs, so revalidate the internal one every alias resolves to.
  const { data: company } = await supabase
    .from("partner_companies")
    .select("slug, name")
    .eq("id", data.company_id)
    .maybeSingle();
  if (company?.slug) {
    revalidatePath(`/partner/${company.slug}/jobs`);
    revalidatePath(`/partner/${company.slug}/jobs/${id}`);
  }

  // Only when it actually moved: re-saving the same status is not an event.
  // `actor: studio` routes this through the service role, which is the ONLY
  // caller allowed to name itself — a rep's label is derived from their
  // membership row instead (see lib/partner-jobs/events.ts).
  if (before?.status !== status) {
    await recordPartnerJobEvent({
      jobId: data.id,
      jobNumber: data.job_number,
      jobName: data.job_name,
      companyId: data.company_id,
      companyName: company?.name ?? "Partner",
      eventType: "job.status_changed",
      actor: { kind: "studio" },
      actorDisplay: "TD Studios",
      summary: `${before ? DESIGN_JOB_STATUS_LABEL[before.status] : "—"} → ${
        DESIGN_JOB_STATUS_LABEL[status]
      }`,
      metadata: { from: before?.status ?? null, to: status },
    });
  }
  return { success: true };
}

/** The Status dropdown on a job's detail page (useActionState + FormData). */
export async function updatePartnerJobStatusAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Supabase is not configured. See README setup." };
  if (!isSupabaseAdminConfigured()) {
    return { error: "Server credentials are not configured." };
  }

  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "That status isn't valid." };

  return applyPartnerJobStatus(parsed.data.id, parsed.data.status);
}

const completeSchema = z.object({
  id: z.string().uuid(),
  complete: z.boolean(),
});

/**
 * The Complete checkbox on the partner jobs list.
 *
 * A binary control over a three-state field, so the mapping has to be stated:
 * ticking sets `completed`, un-ticking sets `in_progress` — NOT `new`, which is
 * the one answer that is certainly false about a job somebody has already been
 * working on. The Status dropdown on the detail page remains the way to set any
 * specific state, so nothing is lost by this control being coarse.
 *
 * The rep's checkbox in the portal writes the SAME field through the same two
 * moves (migration 20260829180000), which is what keeps the two views in sync.
 */
export async function setPartnerJobCompleteAction(
  input: unknown,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Supabase is not configured. See README setup." };
  if (!isSupabaseAdminConfigured()) {
    return { error: "Server credentials are not configured." };
  }

  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { error: "That job couldn't be found." };

  return applyPartnerJobStatus(
    parsed.data.id,
    parsed.data.complete ? "completed" : JOB_INCOMPLETE_STATUS,
  );
}
