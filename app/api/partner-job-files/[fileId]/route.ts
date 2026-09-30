import { getPartnerContext, getUser, isAdminEmail } from "@/lib/auth";
import { ensurePartnerPdfPreview } from "@/lib/partner-jobs/previews";
import { getPartnerJobFile } from "@/lib/partner-jobs/queries";
import { hasPartnerWebPreview, partnerExtensionOf } from "@/lib/partner-jobs/uploads";
import { previewKind } from "@/lib/portal";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "partner-job-files";

// pdf.js + @napi-rs/canvas render PDF previews in this route (native, Node-only).
export const runtime = "nodejs";

// GET /api/partner-job-files/[fileId]            — download
// GET /api/partner-job-files/[fileId]?inline=1   — the original, inline (images & PDFs)
// GET /api/partner-job-files/[fileId]?thumb=1    — 640px square WebP (the jobs grid)
// GET /api/partner-job-files/[fileId]?preview=1  — 1600px WebP (file tiles, "View" on an image)
//
// The `partner-job-files` bucket is private, so a raw object URL is worthless
// and the only way to the bytes is a short-lived signed URL minted here.
//
// TWO CALLERS, TWO CLIENTS — and the split is the authorization model:
//
//   * a PARTNER REP is served through the cookie-scoped client, so the row read
//     and `createSignedUrl` are both RLS-checked. A file id belonging to another
//     company simply returns no row, which is a 404 rather than a download. This
//     route therefore contains no company comparison of its own: there is no
//     second predicate to drift out of step with the policy.
//
//   * a TD STUDIOS ADMIN is served through the service-role client, because
//     partner tables carry no `owner_id` and so have no admin policy to read
//     through (see migration 20260825120000). `isAdminEmail()` is the whole gate
//     on that branch, which is why it is checked before anything is fetched.
//
// Anyone who is neither gets 404 — not 403, which would confirm the file exists.
//
// THUMBNAILS (?thumb=1) exist because production artwork is enormous — a single
// job label in this bucket is 4.3 MB, and the jobs grid shows up to four images
// per card across dozens of cards. Supabase Storage's image transform renders
// that same file to a 640px WebP of about 55 KB, an ~80x reduction, and it is
// reached by adding `transform` to the signed URL — no thumbnail table, no
// generation step, no second bucket, and nothing to backfill for the files
// already here. (Vercel's own image optimizer is NOT an option in this project:
// it returns OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED in production, which is
// also why the grid uses plain <img> rather than next/image.)
//
// PDFs, which the transform cannot read, get a first-page WebP rendered once on
// the server and stored beside the original (lib/partner-jobs/previews.ts). The
// route renders it on the first request that finds it missing, so PDFs filed
// before previews existed need no backfill; after that it is one signed URL.
// ?preview=1 serves that WebP as-is and ?thumb=1 runs it through the same
// transform as any image.
//
// Two consequences worth keeping in step:
//   * a thumb/preview request for anything hasPartnerWebPreview() refuses —
//     AI/PSD/EPS, or an SVG, which can carry script — is a 404 rather than a
//     fallback to the full file. The UI never asks for one.
//   * the redirect is CACHED by the browser (THUMB_CACHE_SECONDS), which is what
//     stops a scroll back up the page re-invoking this function per image. The
//     signed URL therefore has to outlive that cache window, or a replayed
//     redirect would land on an expired token — hence THUMB_SIGNED_SECONDS being
//     comfortably the larger of the two. Do not lower one without the other.
//
// /api is outside the proxy matcher, so this route authenticates itself and must
// keep doing so. Mirrors app/api/files/[fileId]/route.ts and
// app/api/mylar-artwork/[inquiryId]/route.ts.

/** Long edge of a grid thumbnail. Covers a 2-column phone at 3x DPR. */
const THUMB_SIZE = 640;
const THUMB_QUALITY = 60;
/** Must stay > THUMB_CACHE_SECONDS — see the note above. */
const THUMB_SIGNED_SECONDS = 60 * 60;
const THUMB_CACHE_SECONDS = 30 * 60;

const THUMB_TRANSFORM = {
  width: THUMB_SIZE,
  height: THUMB_SIZE,
  resize: "cover",
  quality: THUMB_QUALITY,
} as const;

/** Long edge of a detail-view preview — matches PREVIEW_LONG_EDGE for PDFs. */
const PREVIEW_SIZE = 1600;
const PREVIEW_TRANSFORM = {
  width: PREVIEW_SIZE,
  height: PREVIEW_SIZE,
  resize: "contain",
  quality: 75,
} as const;

type WebSize = "thumb" | "preview";

/**
 * The signed URL for a web-sized rendition, or a Response saying why there is
 * none. `supabase` is whichever client authorized the row read, so the signing
 * is held to the same rule as the read was. A PDF's preview object is rendered
 * (service role, see previews.ts) only after that read has succeeded.
 */
async function webSizedUrl(
  supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>,
  file: { storage_path: string; original_filename: string; mime_type: string | null },
  size: WebSize,
): Promise<string | Response> {
  if (!hasPartnerWebPreview(file.original_filename, file.mime_type)) {
    return new Response("Not found", { status: 404 });
  }

  let path = file.storage_path;
  let transform: typeof THUMB_TRANSFORM | typeof PREVIEW_TRANSFORM | undefined =
    size === "thumb" ? THUMB_TRANSFORM : PREVIEW_TRANSFORM;

  if (partnerExtensionOf(file.original_filename) === "pdf") {
    const previewPath = await ensurePartnerPdfPreview(file.storage_path);
    if (!previewPath) return new Response("Preview unavailable", { status: 404 });
    path = previewPath;
    // Already a PREVIEW_SIZE WebP; transforming it again would only re-encode.
    if (size === "preview") transform = undefined;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, THUMB_SIGNED_SECONDS, transform ? { transform } : {});
  if (error || !data?.signedUrl) {
    console.error("partner job web-sized url", error?.message);
    return new Response("Could not generate preview", { status: 500 });
  }
  return data.signedUrl;
}

/**
 * 302 to the signed URL, telling the browser it may replay this redirect.
 * `private` keeps it out of shared caches — the URL it points at is a bearer
 * token for one file.
 */
function thumbRedirect(signedUrl: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location: signedUrl,
      "cache-control": `private, max-age=${THUMB_CACHE_SECONDS}`,
    },
  });
}

export async function GET(
  req: Request,
  ctx: RouteContext<"/api/partner-job-files/[fileId]">,
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { fileId } = await ctx.params;
  const params = new URL(req.url).searchParams;
  const webSize: WebSize | null =
    params.get("thumb") === "1"
      ? "thumb"
      : params.get("preview") === "1"
        ? "preview"
        : null;
  const inlineRequested = params.get("inline") === "1";

  const admin = isAdminEmail(user.email);
  if (!admin) {
    const partner = await getPartnerContext();
    if (!partner) return new Response("Not found", { status: 404 });

    const supabase = await createClient();
    const { data: file } = await supabase
      .from("design_job_files")
      .select("id, storage_path, original_filename, mime_type")
      .eq("id", fileId)
      .maybeSingle();
    if (!file) return new Response("Not found", { status: 404 });

    if (webSize) {
      const url = await webSizedUrl(supabase, file, webSize);
      return typeof url === "string" ? thumbRedirect(url) : url;
    }

    const canInline = inlineRequested && previewKind(file.mime_type) !== null;
    const { data: signed, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(
        file.storage_path,
        60,
        canInline ? {} : { download: file.original_filename },
      );
    if (error || !signed?.signedUrl) {
      console.error("partner job file signed url", error?.message);
      return new Response("Could not generate download", { status: 500 });
    }
    return Response.redirect(signed.signedUrl, 302);
  }

  if (!isSupabaseAdminConfigured()) {
    return new Response("Not configured", { status: 500 });
  }
  const file = await getPartnerJobFile(fileId);
  if (!file) return new Response("Not found", { status: 404 });

  const supabase = createAdminClient();

  if (webSize) {
    const url = await webSizedUrl(supabase, file, webSize);
    return typeof url === "string" ? thumbRedirect(url) : url;
  }

  const canInline = inlineRequested && previewKind(file.mime_type) !== null;
  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(
      file.storage_path,
      60,
      canInline ? {} : { download: file.original_filename },
    );
  if (error || !signed?.signedUrl) {
    console.error("partner job file signed url (admin)", error?.message);
    return new Response("Could not generate download", { status: 500 });
  }
  return Response.redirect(signed.signedUrl, 302);
}
