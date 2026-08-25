import { getPartnerContext, getUser, isAdminEmail } from "@/lib/auth";
import { getPartnerJobFile } from "@/lib/partner-jobs/queries";
import { previewKind } from "@/lib/portal";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "partner-job-files";

// GET /api/partner-job-files/[fileId]          — download
// GET /api/partner-job-files/[fileId]?inline=1 — inline preview (images & PDFs)
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
// /api is outside the proxy matcher, so this route authenticates itself and must
// keep doing so. Mirrors app/api/files/[fileId]/route.ts and
// app/api/mylar-artwork/[inquiryId]/route.ts.
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/partner-job-files/[fileId]">,
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { fileId } = await ctx.params;
  const inlineRequested = new URL(req.url).searchParams.get("inline") === "1";

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

  const canInline = inlineRequested && previewKind(file.mime_type) !== null;
  const supabase = createAdminClient();
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
