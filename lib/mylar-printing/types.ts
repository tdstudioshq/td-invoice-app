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

import type { MylarBagType, MylarInquiryStatus } from "@/lib/types/database";

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
   * mapping is self-evident. The pound bag is still on the shared placeholder;
   * to give it its real mockup, drop `pound-bag.png` in that folder and change
   * this one line — nothing else needs touching. Any aspect ratio works: the card renders it
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
    image: "/mylar-bags/placeholder.jpg",
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

export type MylarArtworkSide = "front" | "back";

export const ARTWORK_SIDES: readonly MylarArtworkSide[] = ["front", "back"];

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
  frontArtwork?: MylarArtworkFile;
  backArtwork?: MylarArtworkFile;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
}

export const EMPTY_DRAFT: MylarPrintingDraft = {
  quantity: MIN_QUANTITY,
  artworkComingLater: false,
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
