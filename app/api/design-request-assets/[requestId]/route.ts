import { getUser, isAdminEmail } from "@/lib/auth";
import { getCustomDesignRequestFile } from "@/lib/design-requests/queries";
import { previewKind } from "@/lib/portal";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

const BUCKET = "design-requests";

export async function GET(
  req: Request,
  ctx: RouteContext<"/api/design-request-assets/[requestId]">,
) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!isAdminEmail(user.email)) return new Response("Not found", { status: 404 });
  if (!isSupabaseAdminConfigured()) return new Response("Not configured", { status: 500 });
  const { requestId } = await ctx.params;
  const params = new URL(req.url).searchParams;
  const fileId = params.get("file");
  if (!fileId) return new Response("Bad request", { status: 400 });
  const file = await getCustomDesignRequestFile(requestId, fileId);
  if (!file) return new Response("Not found", { status: 404 });
  const canInline = params.get("inline") === "1" && previewKind(file.mime_type) !== null;
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(file.storage_path, 60, canInline ? {} : { download: file.file_name });
  if (error || !data?.signedUrl) return new Response("Could not generate download", { status: 500 });
  return Response.redirect(data.signedUrl, 302);
}
