import { CutlineInputError, composeCutlinePdf } from "@/lib/cutline/compose";
import {
  MAX_FILE_BYTES,
  isAcceptedImage,
  magicHead,
  pdfNameFor,
  sniffImageMagic,
} from "@/lib/cutline/limits";

// Node runtime — sharp + pdf-lib are native/Node-only. (Default for route
// handlers, declared explicitly so it can never be flipped to edge.)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/cutline/generate — PUBLIC, no auth. Compose ONE uploaded image into
// a print-ready cutline PDF and stream it straight back. Nothing is persisted:
// the source is read from the request, processed in memory, and the PDF is the
// response body. The client downloads it as a blob and (for batches) zips the
// blobs locally — see app/tools/cutline-generator/cutline-generator.tsx.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  const presetId = (form.get("preset") as string | null) ?? null;

  // Strict safety limits: JPG/PNG only, size-capped, reject everything else.
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "No image provided." }, { status: 400 });
  }
  if (!isAcceptedImage(file.type, file.name)) {
    return Response.json(
      { error: "Only JPG and PNG images are supported." },
      { status: 415 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "Image is too large (30 MB max)." }, { status: 413 });
  }

  // Read the multipart body ONCE into a Buffer — the only thing sharp ever sees.
  // (No base64, no stringify, no req.text()/json(), no second read of the stream.)
  const sourceBytes = Buffer.from(await file.arrayBuffer());

  // Authoritative content check by magic bytes — never trust MIME/extension alone.
  if (!sniffImageMagic(sourceBytes)) {
    return Response.json(
      {
        error: `Uploaded file bytes are not a valid JPG/PNG. Received: ${magicHead(sourceBytes)}`,
      },
      { status: 415 },
    );
  }

  let pdfBytes: Uint8Array;
  try {
    // Vector CutContour overlay is embedded as a Form XObject — never rasterised.
    pdfBytes = await composeCutlinePdf(sourceBytes, { presetId });
  } catch (err) {
    // A bad upload (undecodable image) is the user's fault → 415 with a clear,
    // actionable message. Anything else is an unexpected server error → 422, and
    // we log the full reason so it's debuggable (the client only sees JSON).
    if (err instanceof CutlineInputError) {
      console.warn(
        `[cutline] rejected "${file.name}" (${file.type || "no type"}, ${file.size} bytes): ${err.message}`,
      );
      return Response.json({ error: err.message }, { status: 415 });
    }
    console.error(`[cutline] compose failed for "${file.name}":`, err);
    const message = err instanceof Error ? err.message : "Could not generate the PDF.";
    return Response.json({ error: message }, { status: 422 });
  }

  const name = pdfNameFor(file.name);
  return new Response(pdfBytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
