"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { recordPartnerJobEvent } from "@/lib/partner-jobs/events";
import {
  DESIGN_JOB_STATUSES,
  DESIGN_JOB_STATUS_LABEL,
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
 * partners deliberately have NO update policy at all (which is what makes "a rep
 * cannot change job status" a database invariant). `requireAdmin()` is therefore
 * the only thing between a caller and a privileged write, and it runs first —
 * before anything is parsed or touched.
 */

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(
    DESIGN_JOB_STATUSES as unknown as [DesignJobStatus, ...DesignJobStatus[]],
  ),
});

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

  const supabase = createAdminClient();

  // Read the OLD status first: "New -> In Progress" is the whole content of the
  // notification, and an UPDATE cannot return the value it just overwrote.
  const { data: before } = await supabase
    .from("design_jobs")
    .select("status")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("design_jobs")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id, company_id, job_number, job_name")
    .maybeSingle();

  if (error) {
    console.error("updatePartnerJobStatusAction", error.message);
    return { error: "Could not update the status." };
  }
  if (!data) return { error: "That job no longer exists." };

  revalidatePath("/partner-jobs");
  revalidatePath(`/partner-jobs/${parsed.data.id}`);
  // The rep's own dashboard renders the same status; the portal is reached at
  // several URLs, so revalidate the internal one every alias resolves to.
  const { data: company } = await supabase
    .from("partner_companies")
    .select("slug, name")
    .eq("id", data.company_id)
    .maybeSingle();
  if (company?.slug) {
    revalidatePath(`/partner/${company.slug}/jobs`);
    revalidatePath(`/partner/${company.slug}/jobs/${parsed.data.id}`);
  }

  // Only when it actually moved: re-saving the same status is not an event.
  // `actor: studio` routes this through the service role, which is the ONLY
  // caller allowed to name itself — a rep's label is derived from their
  // membership row instead (see lib/partner-jobs/events.ts).
  if (before?.status !== parsed.data.status) {
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
        DESIGN_JOB_STATUS_LABEL[parsed.data.status]
      }`,
      metadata: { from: before?.status ?? null, to: parsed.data.status },
    });
  }
  return { success: true };
}
