import { getUser, isAdminEmail } from "@/lib/auth";
import { getMylarInquiry } from "@/lib/mylar-printing/queries";
import { previewKind } from "@/lib/portal";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

const BUCKET = "mylar-artwork";

// GET /api/mylar-artwork/[inquiryId]?side=front       — download the artwork
// GET /api/mylar-artwork/[inquiryId]?side=back&inline=1 — inline preview
//
// ADMIN ONLY. The `mylar-artwork` bucket is private with no storage.objects
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
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!isAdminEmail(user.email)) return new Response("Not found", { status: 404 });
  if (!isSupabaseAdminConfigured()) {
    return new Response("Not configured", { status: 500 });
  }

  const { inquiryId } = await ctx.params;
  const params = new URL(req.url).searchParams;
  const side = params.get("side");
  if (side !== "front" && side !== "back") {
    return new Response("Bad request", { status: 400 });
  }

  const inquiry = await getMylarInquiry(inquiryId);
  if (!inquiry) return new Response("Not found", { status: 404 });

  const path =
    side === "front" ? inquiry.front_artwork_path : inquiry.back_artwork_path;
  const name =
    side === "front" ? inquiry.front_artwork_name : inquiry.back_artwork_name;
  const mimeType =
    side === "front"
      ? inquiry.front_artwork_mime_type
      : inquiry.back_artwork_mime_type;
  if (!path || !name) return new Response("Not found", { status: 404 });

  const canInline = params.get("inline") === "1" && previewKind(mimeType) !== null;

  const supabase = createAdminClient();
  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60, canInline ? {} : { download: name });
  if (error || !signed?.signedUrl) {
    console.error("mylar artwork signed url", error?.message);
    return new Response("Could not generate download", { status: 500 });
  }

  return Response.redirect(signed.signedUrl, 302);
}
