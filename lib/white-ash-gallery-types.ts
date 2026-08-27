/**
 * Types and pure helpers for the White Ash Farms proof gallery.
 *
 * Deliberately free of `server-only` and of any Node import, because the client
 * gallery component needs `assetUrl` and `designLabel` too. The Storage read
 * lives next door in `white-ash-gallery.ts`, which is server-only.
 * (Same split as premade-designs-types.ts / premade-designs.ts.)
 */

/** One design, as written by the renderer's gallery.json. */
export type WhiteAshDesign = {
  name: string;
  folder: string;
  preview: string;
  thumbnail: string;
  width: number | null;
  height: number | null;
  widthIn: number | null;
  heightIn: number | null;
  previewSize: number;
  duplicateOf: string | null;
};

export type WhiteAshRound = {
  key: string;
  label: string;
  count: number;
  designs: WhiteAshDesign[];
};

export type WhiteAshGallery = {
  rounds: WhiteAshRound[];
  total: number;
  generatedAt: string | null;
  assetBase: string;
};

/**
 * Display names for the source folders. The renderer mirrors the artwork tree
 * verbatim, so these are the raw folder names as they exist on disk. Anything
 * unlisted falls back to a tidied-up version of its own name, which means a new
 * round appears correctly before anyone edits this file.
 */
export const WHITE_ASH_ROUND_LABELS: Record<string, string> = {
  Root: "Round 1",
  "2nd round": "Round 2",
  "3RD ROUND (33 PCS)": "Round 3",
  "4th round (20pcs)": "Round 4",
  "5th round (20)": "Round 5",
  "6TH ROUND (20)": "Round 6",
  "final files": "Final Files",
  MISSING: "Missing",
};

const ROUND_ORDER = Object.keys(WHITE_ASH_ROUND_LABELS);

export function whiteAshRoundLabel(key: string): string {
  const known = WHITE_ASH_ROUND_LABELS[key];
  if (known) return known;
  const leaf = key.split("/").filter(Boolean).pop() ?? key;
  return leaf
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function whiteAshRoundRank(key: string): number {
  const i = ROUND_ORDER.indexOf(key);
  return i === -1 ? ROUND_ORDER.length + 1 : i;
}

/**
 * Strip the .pdf extension for display; the rest of the name is left alone so
 * the client can still match a design to the file they were sent.
 */
export function designLabel(design: WhiteAshDesign): string {
  return design.name.replace(/\.pdf$/i, "");
}

/** Absolute public URL for a manifest key like "previews/2nd round/x.webp". */
export function assetUrl(base: string, key: string): string {
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
