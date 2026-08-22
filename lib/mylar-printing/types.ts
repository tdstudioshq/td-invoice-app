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
  MylarContactMethod,
  MylarInquiryStatus,
} from "@/lib/types/database";

export type { MylarBagType, MylarContactMethod, MylarInquiryStatus };

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
    detail: "HEAVY DUTY, INDUSTRY STANDARD 1/8th Bags",
    image: "/mylar-bags/3.5g-4x5.png",
  },
  {
    id: "3.5g-sideways-5x4",
    label: "3.5g Sideways Bag",
    dimensions: '5" × 4"',
    detail:
      "HEAVY DUTY 1/8th Bags turned landscape. Same 3.5g capacity, wider face for your artwork.",
    image: "/mylar-bags/3.5g-sideways-5x4.png",
  },
  {
    id: "2in1-8x5",
    label: "2-in-1 Split Bag",
    dimensions: '8" × 5"',
    detail:
      "Double / Split mylar bag with two 3.5g compartments seamed together down the middle. Perfect for 7g & 14g portions.",
    image: "/mylar-bags/2in1-8x5.png",
  },
  {
    id: "pound-bag",
    label: "Pound Bag",
    dimensions: null,
    detail:
      "HEAVY DUTY large-format mylar. Built for full-pound bulk packaging.",
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

// ---------------------------------------------------------------------------
// Contact preference
// ---------------------------------------------------------------------------

/**
 * How the customer wants to be reached first (migration 0025).
 *
 * INFORMATIONAL ONLY. Nothing in this app messages a customer — picking "Text"
 * does not enrol them in anything, it tells a human which channel to open with.
 * Text leads the list because the home card's primary contact CTA is "Text Me",
 * so it is the channel this audience actually expects.
 */
export const CONTACT_METHODS = [
  {
    id: "text",
    label: "Text",
    detail: "We'll text the number you give us.",
  },
  {
    id: "call",
    label: "Call",
    detail: "We'll give you a call.",
  },
  {
    id: "email",
    label: "Email",
    detail: "We'll reply to your email address.",
  },
] as const satisfies readonly {
  id: MylarContactMethod;
  label: string;
  detail: string;
}[];

/** The channels that need a phone number to be actionable. */
export const PHONE_CONTACT_METHODS: readonly MylarContactMethod[] = [
  "text",
  "call",
];

export function requiresPhone(
  method: MylarContactMethod | null | undefined,
): boolean {
  return method ? PHONE_CONTACT_METHODS.includes(method) : false;
}

const CONTACT_METHOD_BY_ID = new Map(CONTACT_METHODS.map((m) => [m.id, m]));

/** "Text" — or "—" for an inquiry filed before the field existed. */
export function contactMethodLabel(
  method: MylarContactMethod | null | undefined,
): string {
  if (!method) return "—";
  return CONTACT_METHOD_BY_ID.get(method)?.label ?? method;
}

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

/**
 * Re-align allocations after the ORDER TOTAL changes on step 2.
 *
 * This exists because a design's allocation is derived from a total the
 * customer can go back and edit at any time. Without it the split silently
 * keeps referring to the old total, and for a SINGLE design that is a dead end
 * rather than an inconvenience: the wizard hides the per-design quantity input
 * when there is only one design (there is nothing to split), so a stale value
 * leaves an unbalanced allocation with no control on screen able to correct it
 * and Continue disabled.
 *
 * The rule, in two parts:
 *
 *  - ONE design always holds the whole order. There is no split to preserve and
 *    no other value that could ever be valid, so it is re-synced unconditionally
 *    — including over a hand-typed number, which can only be wrong.
 *  - SEVERAL designs are only redistributed while the split is still the even
 *    one this module generated (`customized === false`). Once the customer has
 *    typed their own numbers, their split is left exactly as it is and the
 *    allocation ledger asks them to rebalance. Silently overwriting a
 *    deliberate 600/400 would be worse than showing them an error they can act
 *    on — and unlike the single-design case, every input they need is visible.
 *
 * Returns the SAME array reference when nothing needs to change, so callers can
 * use it in a state updater without forcing a re-render.
 */
export function realignDesigns(
  designs: MylarDesignDraft[],
  total: number,
  customized: boolean,
): MylarDesignDraft[] {
  if (designs.length === 0) return designs;

  if (designs.length === 1) {
    const only = designs[0];
    return only.quantity === total ? designs : [{ ...only, quantity: total }];
  }

  if (customized) return designs;

  const shares = distributeQuantity(total, designs.length);
  const unchanged = designs.every(
    (design, index) => design.quantity === shares[index],
  );
  return unchanged
    ? designs
    : designs.map((design, index) => ({ ...design, quantity: shares[index] }));
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
  /**
   * True once the customer has TYPED a per-design quantity, which makes the
   * split theirs rather than the even one this module generated. Only
   * `realignDesigns` reads it, and only to decide whether a change to the order
   * total may redistribute a multi-design split. Structural edits (add/remove a
   * design) reflow quantities by themselves and do not set it — remove clears
   * it, because it re-distributes evenly and the split is generated again.
   */
  designsCustomized: boolean;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  /** Trading name / company. Optional — plenty of leads are a person. */
  brandName: string;
  /**
   * Preferred first contact channel. Undefined until answered: this is a
   * required question, and defaulting it would record a preference the customer
   * never expressed on the one field whose whole value is that they chose it.
   */
  contactMethod?: MylarContactMethod;
  /** Requested completion date as `YYYY-MM-DD`, or "" when not given. */
  neededBy: string;
  notes: string;
}

export const EMPTY_DRAFT: MylarPrintingDraft = {
  quantity: MIN_QUANTITY,
  artworkComingLater: false,
  designs: [],
  designsCustomized: false,
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  brandName: "",
  neededBy: "",
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
