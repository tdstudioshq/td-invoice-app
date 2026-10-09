"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  MYLAR_INQUIRY_STATUSES,
  type MylarInquiryStatus,
} from "@/lib/mylar-printing/types";
import { verifyMylarShareKey } from "@/lib/mylar-printing/share-link";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import type { ActionState } from "@/app/actions/types";

/**
 * The status write behind the emailed share link (`/mylar-share/[id]`).
 *
 * There is no session here: the signed key IS the authorization, and it is
 * verified against the id before anything is written — a key for one inquiry
 * cannot move another. Kept apart from app/actions/mylar-requests.ts (the
 * requireAdmin() path) so neither page's bundle references the other's
 * endpoint.
 */

const schema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1).max(200),
  status: z.enum(MYLAR_INQUIRY_STATUSES as [MylarInquiryStatus, ...MylarInquiryStatus[]]),
});

export async function updateMylarStatusFromShareAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse({
    id: formData.get("id"),
    key: formData.get("key"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "That status isn't valid." };

  const { id, key, status } = parsed.data;
  if (!verifyMylarShareKey(id, key)) {
    return { error: "This link has expired. Ask TD Studios for a new one." };
  }
  if (!isSupabaseAdminConfigured()) {
    return { error: "Server credentials are not configured." };
  }

  const { error } = await createAdminClient()
    .from("mylar_printing_inquiries")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("updateMylarStatusFromShareAction", error.message);
    return { error: "Could not update the status." };
  }

  revalidatePath("/mylar-requests");
  revalidatePath(`/mylar-requests/${id}`);
  revalidatePath(`/mylar-share/${id}`);
  return { success: true };
}
