import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "client-files";

// GET /api/files/[fileId] — securely download a client file.
//
// Security: not covered by the proxy (matcher excludes /api), so it authenticates
// itself. The client_files row is fetched with the cookie-scoped SSR client, so
// RLS only returns a row the caller may see — an admin's own file OR the portal
// user's assigned client. Anyone requesting another client's id gets 404. We then
// mint a short-lived signed URL (the bucket is private; raw URLs are never
// exposed) and 302-redirect to it. `createSignedUrl` is itself RLS-checked.
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/files/[fileId]">,
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { fileId } = await ctx.params;
  const supabase = await createClient();

  const { data: file } = await supabase
    .from("client_files")
    .select("id, client_id, owner_id, storage_path, name")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, 60, { download: file.name });
  if (error || !signed?.signedUrl) {
    return new Response("Could not generate download", { status: 500 });
  }

  // Best-effort audit trail; never block the download on a logging failure.
  await supabase.from("file_activity").insert({
    owner_id: file.owner_id,
    client_id: file.client_id,
    file_id: file.id,
    actor_id: user.id,
    action: "download",
    detail: { name: file.name },
  });

  return Response.redirect(signed.signedUrl, 302);
}
