/**
 * Cutline overlay presets.
 *
 * Each preset points at a vector cut-contour PDF whose first page is composited
 * on top of the artwork. The output PDF's page size is always derived from the
 * preset's PDF MediaBox (see `lib/cutline/compose.ts`), so a preset fully
 * defines the print bounds — swapping the contour is a one-line change here plus
 * dropping the new PDF under `public/assets/cutlines/`.
 *
 * IMPORTANT: the contour PDF must keep its vector path + spot colour intact
 * (the default file uses a `/Separation /CutContour` colour for Roland
 * VersaWorks). It is embedded as a Form XObject, never rasterised, so whatever
 * colour space the source PDF uses is preserved verbatim.
 *
 * This module is server- and client-safe: it holds metadata only (no `fs`, no
 * Supabase), so the client UI can render the preset picker from `CUTLINE_PRESETS`.
 */

export interface CutlinePreset {
  /** Stable id sent from the client and used in storage paths. */
  id: string;
  /** Human label for the preset picker. */
  label: string;
  /** Short description shown under the label. */
  description: string;
  /**
   * Path to the overlay PDF, relative to the repo root. Bundled into the
   * serverless function via `outputFileTracingIncludes` in `next.config.ts`.
   */
  assetPath: string;
}

export const CUTLINE_PRESETS: CutlinePreset[] = [
  {
    id: "cut-line-file",
    label: "Standard 4×5 contour",
    description: "Rounded-rectangle cut contour for 1200×1500 (4×5″) stickers.",
    assetPath: "public/assets/cutlines/cut-line-file.pdf",
  },
];

export const DEFAULT_CUTLINE_PRESET_ID = CUTLINE_PRESETS[0].id;

export function getCutlinePreset(id: string | null | undefined): CutlinePreset {
  return (
    CUTLINE_PRESETS.find((preset) => preset.id === id) ??
    CUTLINE_PRESETS.find((preset) => preset.id === DEFAULT_CUTLINE_PRESET_ID)!
  );
}
