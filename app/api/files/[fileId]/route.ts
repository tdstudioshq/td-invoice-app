import { getUser } from "@/lib/auth";
import { previewKind } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "client-files";

// GET /api/files/[fileId] — securely download a client file.
// GET /api/files/[fileId]?inline=1 — inline preview (images & PDFs only).
//
// Security: not covered by the proxy (matcher excludes /api), so it authenticates
// itself. The client_files row is fetched with the cookie-scoped SSR client, so
// RLS only returns a row the caller may see — an admin's own file OR the portal
// user's assigned client. Anyone requesting another client's id gets 404. We then
// mint a short-lived signed URL (the bucket is private; raw URLs are never
// exposed) and 302-redirect to it. `createSignedUrl` is itself RLS-checked.
//
// Inline is only ever honored for previewKind() types (non-SVG images + PDF —
// inline SVG can carry scripts); anything else silently degrades to a download
// with the attachment disposition.
export async function GET(
  req: Request,
  ctx: RouteContext<"/api/files/[fileId]">,
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { fileId } = await ctx.params;
  const supabase = await createClient();

  const { data: file } = await supabase
    .from("client_files")
    .select("id, client_id, owner_id, storage_path, name, mime_type")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });

  // thumb=1 behaves like inline=1 but skips the audit log — grid thumbnails
  // fetch through this route in bulk and would otherwise flood the activity
  // timeline with "preview" rows on every page view.
  const params = new URL(req.url).searchParams;
  const isThumb = params.get("thumb") === "1";
  const inlineRequested = isThumb || params.get("inline") === "1";
  const canInline = inlineRequested && previewKind(file.mime_type) !== null;

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(
      file.storage_path,
      60,
      canInline ? {} : { download: file.name },
    );
  if (error || !signed?.signedUrl) {
    return new Response("Could not generate download", { status: 500 });
  }

  // Best-effort audit trail; never block the download on a logging failure.
  if (!isThumb)
    await supabase.from("file_activity").insert({
    owner_id: file.owner_id,
    client_id: file.client_id,
    file_id: file.id,
    actor_id: user.id,
    action: canInline ? "preview" : "download",
    detail: { name: file.name },
  });

  return Response.redirect(signed.signedUrl, 302);
}
