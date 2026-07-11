"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/app/actions/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Star/unstar a file for the signed-in user. Authorization is RLS: the
 * insert's WITH CHECK requires the caller to own the client or be its portal
 * user, and the file lookup itself only resolves rows the caller can see —
 * so a portal user can never favorite another client's (or a hidden) file.
 */
export async function toggleFavoriteAction(
  fileId: string,
): Promise<ActionState & { favorited?: boolean }> {
  if (!isSupabaseConfigured()) return { error: "Not configured." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: existing } = await supabase
    .from("client_file_favorites")
    .select("id")
    .eq("file_id", fileId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("client_file_favorites")
      .delete()
      .eq("id", existing.id);
    if (error) return { error: "Could not remove favorite." };
    revalidatePath("/portal/files");
    return { success: true, favorited: false };
  }

  // RLS-scoped read: resolves only if the caller may see this file.
  const { data: file } = await supabase
    .from("client_files")
    .select("id, client_id")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return { error: "File not found." };

  const { error } = await supabase.from("client_file_favorites").insert({
    user_id: user.id,
    file_id: file.id,
    client_id: file.client_id,
  });
  if (error) return { error: "Could not save favorite." };
  revalidatePath("/portal/files");
  return { success: true, favorited: true };
}
