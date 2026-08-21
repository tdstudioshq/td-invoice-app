"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import {
  MYLAR_INQUIRY_STATUSES,
  type MylarInquiryStatus,
} from "@/lib/mylar-printing/types";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import type { ActionState } from "@/app/actions/types";

/**
 * Admin-side writes for mylar printing inquiries. Kept out of
 * app/actions/mylar-printing.ts so the public wizard's bundle never references
 * an admin-only endpoint.
 *
 * The service-role client is required here for the same reason as the reads:
 * the table has RLS on with no policies, so nothing else can touch it.
 * `requireAdmin()` is therefore the ONLY thing standing between a caller and a
 * privileged write — it runs first, before anything is parsed or written.
 */

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(MYLAR_INQUIRY_STATUSES as [MylarInquiryStatus, ...MylarInquiryStatus[]]),
});

export async function updateMylarInquiryStatusAction(
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
  const { error } = await supabase
    .from("mylar_printing_inquiries")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);

  if (error) {
    console.error("updateMylarInquiryStatusAction", error.message);
    return { error: "Could not update the status." };
  }

  revalidatePath("/mylar-requests");
  revalidatePath(`/mylar-requests/${parsed.data.id}`);
  return { success: true };
}
