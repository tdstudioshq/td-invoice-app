/**
 * Shared types for the Bag Mockup Grid (/tools/bag-mockup-grid). Client- and
 * server-safe: no DOM, no Node, no Supabase imports.
 *
 * Unlike the 8-piece sheet (lib/mockup-generator/), this tool has no fixed
 * template — it's a plain reorderable list of bag mockups, auto-flowed into a
 * fixed-column grid, each one auto cover-fit (no per-image zoom/pan/fit
 * controls). Each cell renders the same die-cut bag shape as the single-bag
 * tool (lib/mockup/geometry.ts).
 */

export const BAG_GRID_EXPORT_FORMATS = ["png", "jpg", "pdf"] as const;
export type BagGridExportFormat = (typeof BAG_GRID_EXPORT_FORMATS)[number];

/** Capped lower than the single-bag tool's export DPIs — a full grid can be
 * dozens of bags, so pixel counts scale fast (see MAX_OUTPUT_PIXELS). */
export const BAG_GRID_EXPORT_DPIS = [72, 150, 300] as const;
export type BagGridExportDpi = (typeof BAG_GRID_EXPORT_DPIS)[number];

/** Client-side state for one grid image. */
export type GridImage = {
  id: string;
  file: File;
  previewUrl: string;
};
