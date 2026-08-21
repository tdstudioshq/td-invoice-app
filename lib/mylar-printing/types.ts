/**
 * Domain model for the public Custom Mylar Printing wizard (/mylar-printing).
 *
 * Server- and client-safe: no DOM, no Node, no Supabase imports — the wizard
 * UI, the zod schema, the server action, and the admin screens all read the
 * same constants from here. `MylarBagType` / `MylarInquiryStatus` themselves
 * live in lib/types/database.ts (the schema mirror) so the DB column type and
 * the UI can never disagree; this module adds the labels and ordering.
 *
 * This is a QUOTE REQUEST flow, not commerce: nothing here knows about price,
 * shipping, tax, or turnaround. Adding those later means adding fields and a
 * step (see WIZARD_STEPS) — not reworking this model.
 */

import type {
  MylarArtworkSideValue,
  MylarBagType,
  MylarInquiryStatus,
} from "@/lib/types/database";

export type { MylarBagType, MylarInquiryStatus };

export interface MylarBagOption {
  id: MylarBagType;
  /** Customer-facing name, e.g. "3.5g Standard Bag". */
  label: string;
  /** Printed dimensions, or null for styles sold without a fixed size. */
  dimensions: string | null;
  /** One-line description under the dimensions. */
  detail: string;
  /**
   * Preview image shown on the option card, as a path under `public/`.
   *
   * Files are named after the option id (`public/mylar-bags/<id>.png`), so the
   * mapping is self-evident. To add or swap a mockup, drop `<id>.png` in that
   * folder and change this one line — nothing else needs touching.
   * `placeholder.png` stays as the fallback for any style added before its
   * artwork exists. Store the file at 192px, the size `BagPreview` renders it
   * `unoptimized` at. Any aspect ratio works: the card renders it
   * `object-contain` inside a fixed square box, so portrait, landscape, and
   * oversized bags all sit correctly without cropping.
   */
  image: string;
}

export const MYLAR_BAG_OPTIONS: readonly MylarBagOption[] = [
  {
    id: "3.5g-4x5",
    label: "3.5g Standard Bag",
    dimensions: '4" × 5"',
    detail: "Portrait orientation. The everyday eighth bag.",
    image: "/mylar-bags/3.5g-4x5.png",
  },
  {
    id: "3.5g-sideways-5x4",
    label: "3.5g Sideways Bag",
    dimensions: '5" × 4"',
    detail: "Landscape orientation, same capacity.",
    image: "/mylar-bags/3.5g-sideways-5x4.png",
  },
  {
    id: "2in1-8x5",
    label: "2-in-1 Split Bag",
    dimensions: '8" × 5"',
    detail: "Double / split mylar bag with two compartments.",
    image: "/mylar-bags/2in1-8x5.png",
  },
  {
    id: "pound-bag",
    label: "Pound Bag",
    dimensions: null,
    detail: "Large-format mylar packaging for bulk.",
    image: "/mylar-bags/pound-bag.png",
  },
] as const;

const BAG_OPTION_BY_ID = new Map(MYLAR_BAG_OPTIONS.map((o) => [o.id, o]));

export function bagOption(id: MylarBagType): MylarBagOption | undefined {
  return BAG_OPTION_BY_ID.get(id);
}

/** "3.5g Standard Bag (4" × 5")" — one line for summaries, email, admin table. */
export function bagTypeLabel(id: MylarBagType | null | undefined): string {
  if (!id) return "—";
  const option = BAG_OPTION_BY_ID.get(id);
  if (!option) return id;
  return option.dimensions
    ? `${option.label} (${option.dimensions})`
    : option.label;
}

/** The print minimum, in pieces — 1 lb portioned at 3.5 g is ~128 bags. */
export const MIN_QUANTITY = 128;

/** Sanity ceiling on a public endpoint; mirrors the DB check constraint. */
export const MAX_QUANTITY = 1_000_000;

/** One-tap quantities on the quantity step. */
export const QUANTITY_PRESETS = [128, 256, 500, 1000] as const;

/** ± nudge per click on the stepper. */
export const QUANTITY_STEP = 32;

/** Design counts offered as buttons; anything higher uses the numeric input. */
export const DESIGN_COUNT_CHOICES = [1, 2, 3, 4] as const;

/** First design count that requires the "More than 4" numeric input. */
export const DESIGN_COUNT_CUSTOM_MIN = 5;

export const MAX_DESIGN_COUNT = 500;

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/**
 * The wizard is one page with a step index — not a route per step. Adding a
 * future step (material, finish, turnaround, price…) is an entry here plus a
 * case in the wizard's renderer; nothing else derives the count or the
 * "STEP n OF m" label independently.
 */
export const WIZARD_STEPS = [
  { id: "bag-type", label: "Bag Type" },
  { id: "quantity", label: "Quantity" },
  { id: "designs", label: "Designs" },
  { id: "artwork", label: "Artwork" },
  { id: "details", label: "Details" },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export const STEP_COUNT = WIZARD_STEPS.length;

export function stepIndexOf(id: WizardStepId): number {
  return WIZARD_STEPS.findIndex((step) => step.id === id);
}

// ---------------------------------------------------------------------------
// Draft state
// ---------------------------------------------------------------------------

/**
 * An artwork file that has already been uploaded to the private
 * `mylar-artwork` bucket. Only the storage key and metadata travel with the
 * submission — never the bytes, and never a public URL.
 */
export interface MylarArtworkFile {
  path: string;
  name: string;
  size: number;
  mimeType: string;
}

/** Mirrors the `side` check constraint on mylar_artwork_files (migration 0024). */
export type MylarArtworkSide = MylarArtworkSideValue;

export const ARTWORK_SIDES: readonly MylarArtworkSide[] = ["front", "back"];

export function artworkSideLabel(side: MylarArtworkSide): string {
  return side === "front" ? "Front" : "Back";
}

/** Hard ceiling on designs in one order; mirrors the DB check constraint. */
export const MAX_DESIGNS_PER_ORDER = MAX_DESIGN_COUNT;

/**
 * One design in the order: its own bag allocation and its own artwork.
 *
 * `id` is a client-generated uuid that becomes the `mylar_designs` row id AND
 * the design segment of every artwork object key, exactly as `inquiryId`
 * already does one level up. That single identity is what proves an uploaded
 * object belongs to the design claiming it. It is a STABLE id, never an array
 * index — removing Design 2 must not silently re-point Design 3's artwork.
 */
export interface MylarDesignDraft {
  id: string;
  quantity: number;
  frontArtwork?: MylarArtworkFile;
  backArtwork?: MylarArtworkFile;
}

/**
 * Split `total` across `count` designs as evenly as possible, largest share
 * first, so the parts always sum back to `total` exactly.
 *
 *   1000 / 4 -> [250, 250, 250, 250]
 *   1000 / 3 -> [334, 333, 333]
 *
 * Integer arithmetic only: a float split plus rounding drifts off the total,
 * and the whole point of this step is that the allocation balances.
 */
export function distributeQuantity(total: number, count: number): number[] {
  if (count <= 0) return [];
  const safeTotal = Math.max(0, Math.floor(total));
  const base = Math.floor(safeTotal / count);
  const remainder = safeTotal - base * count;
  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

/** Sum of every design's allocation. */
export function allocatedQuantity(
  designs: readonly MylarDesignDraft[],
): number {
  return designs.reduce(
    (sum, design) => sum + (Number.isFinite(design.quantity) ? design.quantity : 0),
    0,
  );
}

/**
 * Build `count` designs holding `total` bags between them, preserving anything
 * already captured for the designs that survive.
 *
 * Called when the customer changes the design count on step 3 and when the
 * artwork step first initialises. Existing entries keep their id — and so keep
 * their uploaded artwork, which is keyed by that id — while quantities are
 * redistributed, because the previous split no longer adds up once the number
 * of designs changes.
 */
export function resizeDesigns(
  existing: readonly MylarDesignDraft[],
  count: number,
  total: number,
  makeId: () => string,
): MylarDesignDraft[] {
  const shares = distributeQuantity(total, count);
  return shares.map((quantity, index) => {
    const previous = existing[index];
    return previous
      ? { ...previous, quantity }
      : { id: makeId(), quantity };
  });
}

/**
 * Everything the wizard collects. `quantity` is a number because the stepper
 * always has a value; the optional fields are the ones a customer has not
 * answered yet. Scalars from here are what gets mirrored into sessionStorage
 * — File objects never are.
 */
export interface MylarPrintingDraft {
  bagType?: MylarBagType;
  quantity: number;
  designCount?: number;
  artworkComingLater: boolean;
  /**
   * One entry per design, each with its own allocation and artwork. Seeded
   * from `designCount` when the artwork step opens, so a customer who said
   * "4 designs" is not asked to press "Add another design" four times.
   */
  designs: MylarDesignDraft[];
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
}

export const EMPTY_DRAFT: MylarPrintingDraft = {
  quantity: MIN_QUANTITY,
  artworkComingLater: false,
  designs: [],
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  notes: "",
};

// ---------------------------------------------------------------------------
// Statuses (admin side)
// ---------------------------------------------------------------------------

export const MYLAR_INQUIRY_STATUSES: readonly MylarInquiryStatus[] = [
  "new",
  "reviewing",
  "quoted",
  "approved",
  "printing",
  "completed",
  "cancelled",
];

export const MYLAR_INQUIRY_STATUS_LABEL: Record<MylarInquiryStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  quoted: "Quoted",
  approved: "Approved",
  printing: "Printing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function isMylarInquiryStatus(
  value: string,
): value is MylarInquiryStatus {
  return (MYLAR_INQUIRY_STATUSES as readonly string[]).includes(value);
}
