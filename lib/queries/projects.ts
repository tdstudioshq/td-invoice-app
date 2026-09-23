import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { PORTAL_HIDDEN_PROJECT_STATUSES } from "@/lib/projects";
import type {
  ClientFileFolder,
  ClientProject,
  FileActivity,
} from "@/lib/types/database";

/**
 * Client project, folder, favorite and activity reads.
 *
 * Split out of the former lib/data.ts, which had grown to hold nine
 * unrelated domains in one module.
 */

/**
 * Projects for a client, soonest due first. `visibleOnly` applies the same
 * filter the portal RLS enforces (no draft/archived) — used by the admin
 * "view as client" preview; portal sessions get it from RLS for free.
 */
export async function getClientProjects(
  clientId: string,
  opts: { visibleOnly?: boolean } = {},
): Promise<ClientProject[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  let query = supabase
    .from("client_projects")
    .select("*")
    .eq("client_id", clientId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (opts.visibleOnly) {
    query = query.not(
      "status",
      "in",
      `(${PORTAL_HIDDEN_PROJECT_STATUSES.join(",")})`,
    );
  }
  const { data, error } = await query;
  if (error) {
    console.error("getClientProjects", error.message);
    return [];
  }
  return data ?? [];
}

/** One project by id, or null. RLS hides hidden/foreign projects from portal users. */
export async function getClientProject(
  projectId: string,
): Promise<ClientProject | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    console.error("getClientProject", error.message);
    return null;
  }
  return data;
}

/**
 * Files-per-project counts for a client, keyed by project id. `activeOnly`
 * excludes archived files (preview parity with portal RLS).
 */
export async function getProjectFileCounts(
  clientId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Record<string, number>> {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createClient();
  let query = supabase
    .from("client_files")
    .select("project_id")
    .eq("client_id", clientId)
    .not("project_id", "is", null);
  if (opts.activeOnly) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) {
    console.error("getProjectFileCounts", error.message);
    return {};
  }
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.project_id) counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
  }
  return counts;
}

/** Folders for a client. RLS-scoped. */
export async function getClientFolders(
  clientId: string,
): Promise<ClientFileFolder[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_file_folders")
    .select("*")
    .eq("client_id", clientId)
    .order("name", { ascending: true });
  if (error) {
    console.error("getClientFolders", error.message);
    return [];
  }
  return data ?? [];
}

/**
 * The signed-in user's starred file ids for a client (favorites are per-user;
 * RLS returns only the caller's own rows).
 */
export async function getFavoriteFileIds(clientId: string): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_file_favorites")
    .select("file_id")
    .eq("client_id", clientId);
  if (error) {
    console.error("getFavoriteFileIds", error.message);
    return [];
  }
  return (data ?? []).map((row) => row.file_id);
}

/** Recent file activity for a client (admin + that client's portal via RLS). */
export async function getFileActivity(
  clientId: string,
  limit = 20,
): Promise<FileActivity[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("file_activity")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getFileActivity", error.message);
    return [];
  }
  return data ?? [];
}
