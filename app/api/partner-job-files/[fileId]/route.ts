import { getPartnerContext, getUser, isAdminEmail } from "@/lib/auth";
import { getPartnerJobFile } from "@/lib/partner-jobs/queries";
import { previewKind } from "@/lib/portal";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "partner-job-files";

// GET /api/partner-job-files/[fileId]          — download
// GET /api/partner-job-files/[fileId]?inline=1 — inline preview (images & PDFs)
// GET /api/partner-job-files/[fileId]?thumb=1  — small WebP preview (raster only)
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
// Two consequences worth keeping in step:
//   * the transform endpoint needs a real raster image, so a thumb request for a
//     PDF/AI/PSD/EPS — or an SVG, which previewKind() excludes — is a 404 rather
//     than a fallback to the full file. The grid never asks for one.
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
  transform: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    resize: "cover",
    quality: THUMB_QUALITY,
  },
} as const;

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
  const thumbRequested = params.get("thumb") === "1";
  const inlineRequested = thumbRequested || params.get("inline") === "1";

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

    if (thumbRequested) {
      if (previewKind(file.mime_type) !== "image") {
        return new Response("Not found", { status: 404 });
      }
      const { data: thumb, error: thumbError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(file.storage_path, THUMB_SIGNED_SECONDS, THUMB_TRANSFORM);
      if (thumbError || !thumb?.signedUrl) {
        console.error("partner job thumb", thumbError?.message);
        return new Response("Could not generate preview", { status: 500 });
      }
      return thumbRedirect(thumb.signedUrl);
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

  if (thumbRequested) {
    if (previewKind(file.mime_type) !== "image") {
      return new Response("Not found", { status: 404 });
    }
    const { data: thumb, error: thumbError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, THUMB_SIGNED_SECONDS, THUMB_TRANSFORM);
    if (thumbError || !thumb?.signedUrl) {
      console.error("partner job thumb (admin)", thumbError?.message);
      return new Response("Could not generate preview", { status: 500 });
    }
    return thumbRedirect(thumb.signedUrl);
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
