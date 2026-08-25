"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import {
  DESIGN_JOB_STATUSES,
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
  const { data, error } = await supabase
    .from("design_jobs")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id, company_id")
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
    .select("slug")
    .eq("id", data.company_id)
    .maybeSingle();
  if (company?.slug) {
    revalidatePath(`/partner/${company.slug}/jobs`);
    revalidatePath(`/partner/${company.slug}/jobs/${parsed.data.id}`);
  }
  return { success: true };
}
