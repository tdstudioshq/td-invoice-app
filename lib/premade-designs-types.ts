export const PREMADE_DESIGNS_PAGE_SIZE = 36;

/**
 * Collection cards per page in the gallery index. Kept at or below
 * PREMADE_DESIGNS_PAGE_SIZE so one view never needs more signed URLs than a
 * single `getPremadeDesignUrlsAction` call allows.
 */
export const PREMADE_COLLECTIONS_PAGE_SIZE = 24;

export interface PremadeDesign {
  id: string;
  name: string;
  path: string;
  title: string;
  folder: string;
  folderLabel: string;
}

export interface SignedPremadeDesignUrls {
  urls: Record<string, string>;
  expiresAt: number;
}

/** One folder in the bucket, rendered as a clickable box in the gallery index. */
export interface PremadeCollection {
  /** The raw folder path — "" for images sitting at the bucket root. */
  value: string;
  label: string;
  count: number;
  /** First design in the folder, used as the card's cover image. */
  cover: PremadeDesign;
}

/**
 * Group the flat manifest into collections. Pure and shared: the page calls it
 * to know which cover images to sign, and the client calls it to render the
 * index — so both always agree on the cover for a folder.
 *
 * `designs` arrives sorted by folder then title, so the first design seen for a
 * folder is a stable cover rather than an arbitrary one.
 */
export function buildPremadeCollections(
  designs: PremadeDesign[],
): PremadeCollection[] {
  const byFolder = new Map<string, PremadeCollection>();

  for (const design of designs) {
    const existing = byFolder.get(design.folder);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byFolder.set(design.folder, {
      value: design.folder,
      label: design.folderLabel,
      count: 1,
      cover: design,
    });
  }

  return [...byFolder.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}
