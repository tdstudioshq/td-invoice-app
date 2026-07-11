"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireOwnedClient, toFieldErrors } from "@/lib/action-helpers";
import { PROJECT_STATUSES } from "@/lib/projects";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import type { ActionState } from "@/app/actions/types";
import type { ProjectStatus } from "@/lib/types/database";

// Admin-side client-project management. Portal users have SELECT-only access
// to projects (RLS, migration 0016) — every write here runs as the owning
// admin through requireOwnedClient.

const statusSchema = z.enum(
  PROJECT_STATUSES as [ProjectStatus, ...ProjectStatus[]],
);

const projectFieldsSchema = z.object({
  client_id: z.string().uuid("Invalid client"),
  name: z.string().trim().min(1, "Project name is required").max(150),
  description: z.string().trim().max(2000).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .optional()
    .or(z.literal("")),
  status: statusSchema,
});

function revalidateProjectPages(clientId: string, projectId?: string) {
  revalidatePath(`/client-portals/${clientId}`);
  revalidatePath(`/client-portals/${clientId}/preview`);
  revalidatePath(`/client-portals/${clientId}/preview/projects`);
  if (projectId) {
    revalidatePath(`/client-portals/${clientId}/projects/${projectId}`);
    revalidatePath(
      `/client-portals/${clientId}/preview/projects/${projectId}`,
    );
  }
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = projectFieldsSchema.safeParse({
    client_id: formData.get("client_id"),
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
    due_date: formData.get("due_date") ?? undefined,
    status: formData.get("status"),
  });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const owned = await requireOwnedClient(parsed.data.client_id);
  if ("error" in owned) return { error: owned.error };

  const { error } = await owned.supabase.from("client_projects").insert({
    owner_id: owned.userId,
    client_id: parsed.data.client_id,
    name: parsed.data.name,
    description: parsed.data.description || null,
    due_date: parsed.data.due_date || null,
    status: parsed.data.status,
  });
  if (error) return { error: error.message };

  revalidateProjectPages(parsed.data.client_id);
  return { success: true };
}

export async function updateProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = projectFieldsSchema
    .extend({ id: z.string().uuid("Invalid project") })
    .safeParse({
      id: formData.get("id"),
      client_id: formData.get("client_id"),
      name: formData.get("name"),
      description: formData.get("description") ?? undefined,
      due_date: formData.get("due_date") ?? undefined,
      status: formData.get("status"),
    });
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error) };
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const owned = await requireOwnedClient(parsed.data.client_id);
  if ("error" in owned) return { error: owned.error };

  const { error } = await owned.supabase
    .from("client_projects")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      due_date: parsed.data.due_date || null,
      status: parsed.data.status,
    })
    .eq("id", parsed.data.id)
    .eq("client_id", parsed.data.client_id);
  if (error) return { error: error.message };

  revalidateProjectPages(parsed.data.client_id, parsed.data.id);
  return { success: true };
}

// clientId is bound by the caller; the confirm dialog form only carries `id`.
// Files keep existing — the FK sets their project_id to null.
export async function deleteProjectAction(
  clientId: string,
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id || !clientId || !isSupabaseConfigured()) return;

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return;

  const { error } = await owned.supabase
    .from("client_projects")
    .delete()
    .eq("id", id)
    .eq("client_id", clientId);
  if (error) return;

  revalidateProjectPages(clientId, id);
  redirect(`/client-portals/${clientId}`);
}

/** Attach a file to a project (or detach with project_id = "none"). */
export async function assignFileToProjectAction(
  formData: FormData,
): Promise<ActionState> {
  const fileId = String(formData.get("file_id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const projectIdRaw = String(formData.get("project_id") ?? "");
  if (!fileId || !clientId) return { error: "Missing file or client." };
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }
  // The project <Select> uses "none" as its empty sentinel (Radix forbids "").
  const projectId =
    projectIdRaw && projectIdRaw !== "none" ? projectIdRaw : null;

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return { error: owned.error };

  if (projectId) {
    const { data: project } = await owned.supabase
      .from("client_projects")
      .select("id")
      .eq("id", projectId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (!project) return { error: "Project not found for this client." };
  }

  const { error } = await owned.supabase
    .from("client_files")
    .update({ project_id: projectId })
    .eq("id", fileId)
    .eq("client_id", clientId);
  if (error) return { error: error.message };

  revalidateProjectPages(clientId, projectId ?? undefined);
  return { success: true };
}

/** Archive (or restore) a file. Archived files vanish from the portal via RLS. */
export async function setFileArchivedAction(
  formData: FormData,
): Promise<ActionState> {
  const fileId = String(formData.get("file_id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  const archived = formData.get("archived") === "true";
  if (!fileId || !clientId) return { error: "Missing file or client." };
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. See README setup." };
  }

  const owned = await requireOwnedClient(clientId);
  if ("error" in owned) return { error: owned.error };

  const { error } = await owned.supabase
    .from("client_files")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", fileId)
    .eq("client_id", clientId);
  if (error) return { error: error.message };

  revalidateProjectPages(clientId);
  return { success: true };
}
