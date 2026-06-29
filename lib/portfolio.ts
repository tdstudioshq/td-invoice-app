/**
 * Portfolio Gallery — shared types, category model, and pure helpers.
 *
 * This module is intentionally free of any server/Supabase imports so it can be
 * used by BOTH the server data loader (`getPortfolioImages` in `lib/data.ts`)
 * and the client gallery components. The storage listing lives in `lib/data.ts`.
 *
 * Future-ready by design: categories are data-driven (add a row below and the
 * filter bar picks it up), categorisation is keyword-derived from the storage
 * path (so uploading `branding-acme.jpg` or a `logos/` folder auto-tags it with
 * no code change), and the `PortfolioImage` shape has room to grow (favorites,
 * collections, downloads, password-gated sets) without touching the renderer.
 */

/** The bucket every portfolio image is read from. Public bucket, never renamed. */
export const PORTFOLIO_BUCKET = "custom-work";

/**
 * The filter categories shown in the bar. `all` is always first and matches
 * every image. Add categories here — the filter bar and counts update
 * automatically. Keep `id` lowercase/kebab; it doubles as the keyword folder
 * name used by `categorizeImage`.
 */
export const PORTFOLIO_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "packaging", label: "Packaging" },
  { id: "logos", label: "Logos" },
  { id: "websites", label: "Websites" },
  { id: "branding", label: "Branding" },
  { id: "mockups", label: "Mockups" },
] as const;

export type PortfolioCategoryId = (typeof PORTFOLIO_CATEGORIES)[number]["id"];

/** A single portfolio image, resolved to a public URL and a derived category. */
export interface PortfolioImage {
  /** Stable id — the storage path. */
  id: string;
  /** Raw filename, e.g. `acme-box.jpg`. */
  name: string;
  /** Human-friendly title derived from the filename (used for display/search). */
  title: string;
  /** Storage object key within the bucket. */
  path: string;
  /** Public URL served straight from the public bucket. */
  url: string;
  /** Derived category id; `all` when no keyword matches. */
  category: PortfolioCategoryId;
}

/** Keywords that map a path/filename onto a category. Extend freely. */
const CATEGORY_KEYWORDS: Record<
  Exclude<PortfolioCategoryId, "all">,
  string[]
> = {
  packaging: ["packaging", "package", "box", "label"],
  logos: ["logo", "logos", "wordmark", "icon"],
  websites: ["website", "websites", "web", "site", "landing", "ui"],
  branding: ["branding", "brand", "identity", "guideline"],
  mockups: ["mockup", "mockups", "mock", "render"],
};

const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|avif|svg)$/i;

/** Whether a storage object name looks like a renderable image. */
export function isImageFile(name: string): boolean {
  return IMAGE_EXTENSION.test(name);
}

/**
 * Derive a category from the storage path. Checks the first path segment (a
 * folder like `logos/`) first, then any keyword appearing in the path. Defaults
 * to `all` so uncategorised uploads still appear under the All tab.
 */
export function categorizeImage(path: string): PortfolioCategoryId {
  const lower = path.toLowerCase();
  const folder = lower.split("/")[0];
  for (const [id, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => folder === kw || lower.includes(kw))) {
      return id as PortfolioCategoryId;
    }
  }
  return "all";
}

/** Turn `acme-box_final.jpg` into `Acme Box Final` for display + search. */
export function prettifyName(name: string): string {
  return name
    .replace(IMAGE_EXTENSION, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pure filter used by the client gallery. Filters by category (other than the
 * catch-all `all`) and a case-insensitive filename/title search. Kept pure so a
 * future AI/semantic search can swap in without touching the components.
 */
export function filterPortfolioImages(
  images: PortfolioImage[],
  category: PortfolioCategoryId,
  query: string,
): PortfolioImage[] {
  const q = query.trim().toLowerCase();
  return images.filter((image) => {
    const inCategory = category === "all" || image.category === category;
    if (!inCategory) return false;
    if (!q) return true;
    return (
      image.name.toLowerCase().includes(q) ||
      image.title.toLowerCase().includes(q)
    );
  });
}

/** Count images per category id (for the filter-bar badges). */
export function countByCategory(
  images: PortfolioImage[],
): Record<PortfolioCategoryId, number> {
  const counts = Object.fromEntries(
    PORTFOLIO_CATEGORIES.map((c) => [c.id, 0]),
  ) as Record<PortfolioCategoryId, number>;
  counts.all = images.length;
  for (const image of images) {
    if (image.category !== "all") counts[image.category] += 1;
  }
  return counts;
}
