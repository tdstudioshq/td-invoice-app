import { composeBagGridPdf, composeBagGridRaster, MockupGridInputError, type GridFile } from "@/lib/bag-mockup-grid/compose";
import { exportRequestSchema } from "@/lib/bag-mockup-grid/export-schema";
import {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  gridNameFor,
  isAcceptedImage,
  magicHead,
  sniffImageMagic,
} from "@/lib/bag-mockup-grid/limits";

// Node runtime — sharp + pdf-lib are native/Node-only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/bag-mockup-grid/generate — PUBLIC, no auth. Renders each uploaded
// image as a bag mockup (same die-cut geometry as the single-bag tool) and
// assembles them into a 4-column grid, streamed straight back. Nothing is
// persisted — see app/tools/bag-mockup-grid/bag-mockup-grid.tsx.
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

  const files: GridFile[] = [];
  let totalBytes = 0;
  for (const id of request.order) {
    const file = form.get(`file:${id}`);
    if (!(file instanceof File) || file.size === 0) {
      return Response.json({ error: "One of the images is missing from the upload." }, { status: 400 });
    }
    if (!isAcceptedImage(file.type, file.name)) {
      return Response.json({ error: "Only PNG, JPG, and WEBP images are supported." }, { status: 415 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return Response.json({ error: `${file.name} is too large (25 MB max per image).` }, { status: 413 });
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
        { error: `"${file.name}" isn't a valid PNG/JPG/WEBP file. Received: ${magicHead(bytes)}` },
        { status: 415 },
      );
    }
    files.push({ id, bytes });
  }

  try {
    if (request.format === "pdf") {
      const pdfBytes = await composeBagGridPdf(request, files);
      return new Response(pdfBytes as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${gridNameFor("pdf")}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const { bytes } = await composeBagGridRaster(request, files, request.format);
    return new Response(bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": request.format === "jpg" ? "image/jpeg" : "image/png",
        "Content-Disposition": `attachment; filename="${gridNameFor(request.format)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof MockupGridInputError) {
      console.warn(`[bag-mockup-grid] rejected export: ${err.message}`);
      return Response.json({ error: err.message }, { status: 415 });
    }
    console.error("[bag-mockup-grid] compose failed:", err);
    const message = err instanceof Error ? err.message : "Could not generate the grid.";
    return Response.json({ error: message }, { status: 422 });
  }
}
