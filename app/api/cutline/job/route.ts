import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  CUTLINE_BUCKET,
  isValidJobId,
  jobFolder,
  requireAdminApi,
} from "@/lib/cutline/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/cutline/job?jobId=… — remove a job's temporary uploads and
// generated PDFs. Called by the client on "Start over" so working files don't
// linger. Supabase Storage has no recursive delete, so we list each subfolder
// and remove the objects.
export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;

  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!isValidJobId(jobId)) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }

  const supabase = await createClient();
  const folder = jobFolder(uid, jobId);
  const paths: string[] = [];

  for (const sub of ["in", "out"]) {
    const { data: entries } = await supabase.storage
      .from(CUTLINE_BUCKET)
      .list(`${folder}/${sub}`, { limit: 1000 });
    for (const entry of entries ?? []) {
      paths.push(`${folder}/${sub}/${entry.name}`);
    }
  }

  if (paths.length > 0) {
    const { error } = await supabase.storage.from(CUTLINE_BUCKET).remove(paths);
    if (error) {
      return Response.json({ error: error.message }, { status: 502 });
    }
  }

  return Response.json({ ok: true, removed: paths.length });
}
