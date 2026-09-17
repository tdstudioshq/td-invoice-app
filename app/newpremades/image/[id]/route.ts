import { securityService } from "@/lib/security/service";
import { hasNewPremadesAccess } from "../../access";
import designs from "../../manifest.json";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!(await hasNewPremadesAccess())) return new Response("Unauthorized", { status: 401, headers });
  const { id } = await context.params;
  if (!designs.some((design) => design.id === id)) return new Response("Not found", { status: 404, headers });
  const variant = new URL(request.url).searchParams.get("size") === "preview" ? "preview" : "thumb";
  const { data, error } = await securityService().storage.from("restricted-galleries").createSignedUrl(`newpremades/${id}-${variant}.webp`, 60);
  if (error || !data) return new Response("Unavailable", { status: 503, headers });
  return new Response(null, { status: 302, headers: { ...headers, Location: data.signedUrl } });
}
