import { hasGalleryAccess, type Gallery } from "@/lib/security/gallery";
import { securityService } from "@/lib/security/service";
const buckets: Record<string, string> = { designs: "GSO", "taste-budz": "TASTE BUDZ", mafiaterpz: "MAFIA terpz" };
export async function GET(req: Request, ctx: { params: Promise<{ gallery: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };
  const { gallery } = await ctx.params;
  if (!Object.hasOwn(buckets, gallery) || !await hasGalleryAccess(gallery as Gallery)) return new Response("Unauthorized", { status: 401, headers });
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path || path.includes("..") || path.startsWith("/") || path.length > 500) return new Response("Invalid path", { status: 400, headers });
  const { data, error } = await securityService().storage.from(buckets[gallery]).createSignedUrl(path, 60);
  if (error || !data) return new Response("Not found", { status: 404, headers });
  return new Response(null, { status: 302, headers: { ...headers, Location: data.signedUrl } });
}
