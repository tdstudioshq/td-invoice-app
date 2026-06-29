import { composeCutlinePdf } from "@/lib/cutline/compose";
import {
  MAX_FILE_BYTES,
  isAcceptedImage,
  pdfNameFor,
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

  const sourceBytes = Buffer.from(await file.arrayBuffer());

  let pdfBytes: Uint8Array;
  try {
    // Vector CutContour overlay is embedded as a Form XObject — never rasterised.
    pdfBytes = await composeCutlinePdf(sourceBytes, { presetId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Composition failed.";
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
