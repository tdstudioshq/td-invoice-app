import "server-only";

import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import type {
  CustomDesignRequestFileRow,
  CustomDesignRequestRow,
  CustomDesignRequestWithFiles,
} from "@/lib/types/database";

export async function getCustomDesignRequests(): Promise<
  CustomDesignRequestRow[]
> {
  if (!isSupabaseAdminConfigured()) return [];
  const { data, error } = await createAdminClient()
    .from("custom_design_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("getCustomDesignRequests", error.message);
    return [];
  }
  return data ?? [];
}

export async function getCustomDesignRequest(
  id: string,
): Promise<CustomDesignRequestWithFiles | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const supabase = createAdminClient();
  const { data: request, error } = await supabase
    .from("custom_design_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !request) return null;
  const { data: files, error: filesError } = await supabase
    .from("custom_design_request_files")
    .select("*")
    .eq("request_id", id)
    .order("created_at", { ascending: true });
  if (filesError) console.error("getCustomDesignRequest files", filesError.message);
  return { ...request, files: files ?? [] };
}

export async function getCustomDesignRequestFile(
  requestId: string,
  fileId: string,
): Promise<CustomDesignRequestFileRow | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const { data, error } = await createAdminClient()
    .from("custom_design_request_files")
    .select("*")
    .eq("id", fileId)
    .eq("request_id", requestId)
    .maybeSingle();
  return error ? null : data;
}
