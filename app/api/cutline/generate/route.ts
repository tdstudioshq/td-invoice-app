import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { composeCutlinePdf } from "@/lib/cutline/compose";
import {
  CUTLINE_BUCKET,
  MAX_CUTLINE_BYTES,
  SIGNED_URL_TTL_SECONDS,
  inputPath,
  isValidJobId,
  outputPath,
  pdfNameFor,
  requireAdminApi,
} from "@/lib/cutline/storage";

// Node runtime — sharp + pdf-lib are native/Node-only. (Default for route
// handlers, declared explicitly so it can never be flipped to edge.)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

// POST /api/cutline/generate — process ONE uploaded image into a print-ready
// cutline PDF. The client calls this once per file so each row gets its own
// uploading → processing → complete/failed lifecycle. All PDF work is server-side.
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;
  const uid = auth.user.id;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  const jobId = form.get("jobId");
  const presetId = (form.get("preset") as string | null) ?? null;

  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "No image provided." }, { status: 400 });
  }
  if (typeof jobId !== "string" || !isValidJobId(jobId)) {
    return Response.json({ error: "Invalid job id." }, { status: 400 });
  }
  if (file.type && !ACCEPTED_TYPES.has(file.type.toLowerCase())) {
    return Response.json({ error: "Only JPG and PNG images are supported." }, { status: 415 });
  }
  if (file.size > MAX_CUTLINE_BYTES) {
    return Response.json({ error: "Image is too large." }, { status: 413 });
  }

  const supabase = await createClient();
  const sourceBytes = Buffer.from(await file.arrayBuffer());

  // 1. Store the upload temporarily (RLS scopes the {uid}/ folder to this user).
  const srcPath = inputPath(uid, jobId, file.name);
  const { error: uploadError } = await supabase.storage
    .from(CUTLINE_BUCKET)
    .upload(srcPath, sourceBytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
  if (uploadError) {
    return Response.json({ error: `Upload failed: ${uploadError.message}` }, { status: 502 });
  }

  // 2. Compose the print-ready PDF (vector cutline overlay preserved).
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await composeCutlinePdf(sourceBytes, { presetId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Composition failed.";
    return Response.json({ error: message }, { status: 422 });
  }

  // 3. Store the result and hand back a short-lived signed download URL.
  const pdfName = pdfNameFor(file.name);
  const outPath = outputPath(uid, jobId, pdfName);
  const { error: outError } = await supabase.storage
    .from(CUTLINE_BUCKET)
    .upload(outPath, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (outError) {
    return Response.json({ error: `Could not save PDF: ${outError.message}` }, { status: 502 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(CUTLINE_BUCKET)
    .createSignedUrl(outPath, SIGNED_URL_TTL_SECONDS, { download: pdfName });
  if (signError || !signed) {
    return Response.json({ error: "Could not sign download URL." }, { status: 502 });
  }

  return Response.json({
    ok: true,
    name: pdfName,
    outputPath: outPath,
    url: signed.signedUrl,
  });
}
