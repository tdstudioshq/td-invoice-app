import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import {
  PORTFOLIO_BUCKET,
  categorizeImage,
  isImageFile,
  prettifyName,
  type PortfolioImage,
} from "@/lib/portfolio";

/**
 * Public gallery reads, backed by public Supabase Storage buckets.
 *
 * Split out of the former lib/data.ts, which had grown to hold nine
 * unrelated domains in one module.
 */

/**
 * List every image in the public `custom-work` bucket and resolve each to a
 * public URL + derived category. Paginates so the count can grow past Storage's
 * 100-per-list cap with no code change — the `/portfolio` page is
 * `force-dynamic`, so newly uploaded files appear on the next request.
 *
 * Listing `storage.objects` is gated by RLS even for a *public* bucket (public
 * only affects object downloads, not `list()`), so we prefer the service-role
 * client to guarantee the list resolves without a bespoke SELECT policy. This is
 * safe: it runs server-only and returns nothing but public filenames + URLs from
 * an already-public bucket. Falls back to the cookie client, then to an empty
 * array when Supabase isn't configured (graceful-degradation pattern).
 */
export async function getPortfolioImages(): Promise<PortfolioImage[]> {
  return listPublicBucketImages(PORTFOLIO_BUCKET);
}

/**
 * The public `TASTE BUDZ` bucket backing the `/taste-budz` gallery. Same model
 * as the portfolio: upload to the bucket, the page picks it up next request.
 * The brand logo lives in the same bucket but is rendered in the page header,
 * so it's excluded from the grid.
 */
export const TASTE_BUDZ_BUCKET = "TASTE BUDZ";
export const TASTE_BUDZ_LOGO_FILE = "TASTE BUDS READY LOGO.png";

export async function getTasteBudzImages(): Promise<PortfolioImage[]> {
  const images = await listPublicBucketImages(TASTE_BUDZ_BUCKET);
  return images.filter((image) => image.name !== TASTE_BUDZ_LOGO_FILE);
}

/**
 * The public `GSO` bucket backing the `/gso` gallery. Same model as the
 * portfolio: upload to the bucket, the page picks it up next request.
 */
export const GSO_BUCKET = "GSO";

export async function getGsoImages(): Promise<PortfolioImage[]> {
  return listPublicBucketImages(GSO_BUCKET);
}

/**
 * The public `MAFIA terpz` bucket backing the `/mafiaterpz` gallery. Same model
 * as the portfolio: upload to the bucket, the page picks it up next request.
 * Rename this constant to match whatever public bucket you create in Supabase.
 */
export const MAFIA_TERPZ_BUCKET = "MAFIA terpz";

export async function getMafiaTerpzImages(): Promise<PortfolioImage[]> {
  return listPublicBucketImages(MAFIA_TERPZ_BUCKET);
}

async function listPublicBucketImages(
  bucket: string,
): Promise<PortfolioImage[]> {
  const storage = isSupabaseAdminConfigured()
    ? createAdminClient().storage
    : isSupabaseConfigured()
      ? (await createClient()).storage
      : null;
  if (!storage) return [];

  const images: PortfolioImage[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await storage.from(bucket).list("", {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.error(`listPublicBucketImages(${bucket})`, error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const object of data) {
      // Skip folder placeholders (id is null) and non-image objects.
      if (!object.id || !isImageFile(object.name)) continue;
      const path = object.name;
      const { data: pub } = storage.from(bucket).getPublicUrl(path);
      images.push({
        id: path,
        name: object.name,
        title: prettifyName(object.name),
        path,
        url: pub.publicUrl,
        category: categorizeImage(path),
      });
    }

    if (data.length < pageSize) break;
  }

  return images;
}
