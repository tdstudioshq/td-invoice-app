import { getUser, isAdminEmail } from "@/lib/auth";
import { getMylarArtworkFile } from "@/lib/mylar-printing/queries";
import { verifyMylarShareKey } from "@/lib/mylar-printing/share-link";
import { previewKind } from "@/lib/portal";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

const BUCKET = "mylar-artwork";

// GET /api/mylar-artwork/[inquiryId]?file=<artworkFileId>          — download
// GET /api/mylar-artwork/[inquiryId]?file=<artworkFileId>&inline=1 — preview
//
// Addressed by artwork-file id rather than by ?side=, because an inquiry now
// has one front and one back PER DESIGN (migration 0024) and a side alone no
// longer identifies a file. The inquiry id stays in the path so the lookup can
// prove the file belongs to it — see getMylarArtworkFile.
//
// GET /api/mylar-artwork/[inquiryId]?file=<artworkFileId>&key=<shareKey> — from
//   the emailed share link (lib/mylar-printing/share-link.ts), no session.
//
// ADMIN, OR A VALID SHARE KEY FOR THIS INQUIRY. The key is checked against the
// inquiry id in the path, and the file is then proven to belong to that same
// inquiry, so a key opens one request's files and no others. The `mylar-artwork` bucket is private with no storage.objects
// policies, so a raw object URL is worthless and the only way to the bytes is a
// signed URL minted here. Mirrors app/api/files/[fileId]/route.ts, with one
// difference that matters: that route can lean on RLS to scope the row, while
// mylar_printing_inquiries has no owner to scope to — so this route does the
// whole authorization itself, and must keep doing it. /api is excluded from the
// proxy matcher, so nothing else checks the session on the way in.
//
// Inline is honored only for previewKind() types (non-SVG images + PDF);
// PSD/AI/TIFF quietly fall back to a download, which is what you want anyway.
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/mylar-artwork/[inquiryId]">,
) {
  const { inquiryId } = await ctx.params;
  const params = new URL(req.url).searchParams;

  if (!verifyMylarShareKey(inquiryId, params.get("key"))) {
    const user = await getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
    if (!isAdminEmail(user.email)) return new Response("Not found", { status: 404 });
  }
  if (!isSupabaseAdminConfigured()) {
    return new Response("Not configured", { status: 500 });
  }

  const fileId = params.get("file");
  if (!fileId) return new Response("Bad request", { status: 400 });

  // Resolves only when the file's design belongs to THIS inquiry, so a valid
  // file id from another customer's request is a 404, not a download.
  const file = await getMylarArtworkFile(inquiryId, fileId);
  if (!file) return new Response("Not found", { status: 404 });

  const canInline =
    params.get("inline") === "1" && previewKind(file.mime_type) !== null;

  const supabase = createAdminClient();
  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(
      file.storage_path,
      60,
      canInline ? {} : { download: file.file_name },
    );
  if (error || !signed?.signedUrl) {
    console.error("mylar artwork signed url", error?.message);
    return new Response("Could not generate download", { status: 500 });
  }

  return Response.redirect(signed.signedUrl, 302);
}
