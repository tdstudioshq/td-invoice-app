import JSZip from "jszip";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  CUTLINE_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  isValidJobId,
  jobFolder,
  requireAdminApi,
} from "@/lib/cutline/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/cutline/zip — bundle every generated PDF for a job into a ZIP, store
// it, and return a signed URL. The zip is built and downloaded through Supabase
// Storage (not streamed through the function) to stay under platform body caps.
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;

  let body: { jobId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!isValidJobId(body.jobId)) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }
  const jobId = body.jobId;

  const supabase = await createClient();
  const outDir = `${jobFolder(uid, jobId)}/out`;

  const { data: entries, error: listError } = await supabase.storage
    .from(CUTLINE_BUCKET)
    .list(outDir, { limit: 1000 });
  if (listError) {
    return Response.json({ error: listError.message }, { status: 502 });
  }

  const pdfs = (entries ?? []).filter((e) => e.name.toLowerCase().endsWith(".pdf"));
  if (pdfs.length === 0) {
    return Response.json({ error: "No generated PDFs to zip yet." }, { status: 404 });
  }

  const zip = new JSZip();
  for (const entry of pdfs) {
    const { data, error } = await supabase.storage
      .from(CUTLINE_BUCKET)
      .download(`${outDir}/${entry.name}`);
    if (error || !data) {
      return Response.json(
        { error: `Could not read ${entry.name}: ${error?.message ?? "missing"}` },
        { status: 502 },
      );
    }
    zip.file(entry.name, Buffer.from(await data.arrayBuffer()));
  }

  const zipBytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const zipName = `cutlines-${jobId}.zip`;
  const zipPath = `${outDir}/${zipName}`;
  const { error: uploadError } = await supabase.storage
    .from(CUTLINE_BUCKET)
    .upload(zipPath, zipBytes, { contentType: "application/zip", upsert: true });
  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 502 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(CUTLINE_BUCKET)
    .createSignedUrl(zipPath, SIGNED_URL_TTL_SECONDS, { download: zipName });
  if (signError || !signed) {
    return Response.json({ error: "Could not sign download URL." }, { status: 502 });
  }

  return Response.json({ ok: true, name: zipName, count: pdfs.length, url: signed.signedUrl });
}
