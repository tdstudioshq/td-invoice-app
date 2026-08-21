import { composeMockupPdf, composeMockupRaster, MockupInputError, type SlotFile } from "@/lib/mockup-generator/compose";
import { exportRequestSchema } from "@/lib/mockup-generator/export-schema";
import {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  isAcceptedImage,
  magicHead,
  sheetNameFor,
  sniffImageMagic,
} from "@/lib/mockup-generator/limits";

// Node runtime — sharp + pdf-lib are native/Node-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/mockup-sheet/generate — PUBLIC, no auth. Composes the 8-piece
// sheet from the uploaded per-slot images + placement metadata and streams
// the result straight back (PNG/JPG/PDF). Nothing is persisted: source images
// are read from the request, composed in memory, and the response body is the
// only output — see app/tools/8pc-mockup-generator/mockup-sheet-generator.tsx.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const metaRaw = form.get("meta");
  if (typeof metaRaw !== "string") {
    return Response.json({ error: "Missing export settings." }, { status: 400 });
  }

  let metaJson: unknown;
  try {
    metaJson = JSON.parse(metaRaw);
  } catch {
    return Response.json({ error: "Export settings were not valid JSON." }, { status: 400 });
  }

  const parsed = exportRequestSchema.safeParse(metaJson);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid export settings." },
      { status: 400 },
    );
  }
  const request = parsed.data;

  const files: SlotFile[] = [];
  let totalBytes = 0;
  for (const placement of request.placements) {
    const file = form.get(`file:${placement.slotId}`);
    if (!(file instanceof File) || file.size === 0) {
      return Response.json(
        { error: `Missing image for slot ${placement.slotId}.` },
        { status: 400 },
      );
    }
    if (!isAcceptedImage(file.type, file.name)) {
      return Response.json(
        { error: "Only PNG, JPG, and WEBP images are supported." },
        { status: 415 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json(
        { error: `${file.name} is too large (25 MB max per image).` },
        { status: 413 },
      );
    }
    totalBytes += file.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return Response.json(
        { error: "Combined upload is too large. Try fewer or smaller images." },
        { status: 413 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!sniffImageMagic(bytes)) {
      return Response.json(
        {
          error: `"${file.name}" isn't a valid PNG/JPG/WEBP file. Received: ${magicHead(bytes)}`,
        },
        { status: 415 },
      );
    }
    files.push({ slotId: placement.slotId, bytes });
  }

  try {
    if (request.format === "pdf") {
      const pdfBytes = await composeMockupPdf(request, files);
      return new Response(pdfBytes as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${sheetNameFor("pdf")}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const { bytes } = await composeMockupRaster(request, files, request.format);
    return new Response(bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": request.format === "jpg" ? "image/jpeg" : "image/png",
        "Content-Disposition": `attachment; filename="${sheetNameFor(request.format)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof MockupInputError) {
      console.warn(`[mockup-sheet] rejected export: ${err.message}`);
      return Response.json({ error: err.message }, { status: 415 });
    }
    console.error("[mockup-sheet] compose failed:", err);
    const message = err instanceof Error ? err.message : "Could not generate the sheet.";
    return Response.json({ error: message }, { status: 422 });
  }
}
