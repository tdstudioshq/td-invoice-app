"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionState } from "@/app/actions/types";
import { requireAdmin } from "@/lib/auth";
import {
  CUSTOM_DESIGN_REQUEST_STATUSES,
} from "@/lib/design-requests/types";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CUSTOM_DESIGN_REQUEST_STATUSES),
});

export async function updateCustomDesignRequestStatusAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Supabase is not configured." };
  if (!isSupabaseAdminConfigured()) return { error: "Server credentials are not configured." };
  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "That status isn't valid." };
  const { error } = await createAdminClient()
    .from("custom_design_requests")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);
  if (error) {
    console.error("updateCustomDesignRequestStatusAction", error.message);
    return { error: "Could not update the status." };
  }
  revalidatePath("/design-requests");
  revalidatePath(`/design-requests/${parsed.data.id}`);
  return { success: true };
}
