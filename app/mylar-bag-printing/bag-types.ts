/**
 * The four mylar bag styles this form takes orders for, and the quantity rules
 * that go with each. Shared by the page (copy) and the form (pricing math), and
 * server- and client-safe.
 *
 * Two counting modes:
 *  - `pounds` — the customer orders by the pound and we print PIECES_PER_POUND
 *    bags per pound, because 1 lb of product portioned at 3.5 g needs ~128 bags.
 *  - `pieces` — Pound Bags each hold a full pound, so the lb conversion is
 *    meaningless there; the customer counts bags directly instead.
 *
 * Both modes bottom out at the same 128-bag floor, which is the print minimum.
 */

/** Bags printed per pound ordered — 1 lb / 3.5 g portions ≈ 128 pieces. */
export const PIECES_PER_POUND = 128;

/** The print minimum, in pieces. 1 lb in `pounds` mode hits exactly this. */
export const MIN_PIECES = 128;

export type QuantityMode = "pounds" | "pieces";

export type BagType = {
  id: string;
  label: string;
  detail: string;
  mode: QuantityMode;
};

export const BAG_TYPES: BagType[] = [
  {
    id: "4x5-3.5g",
    label: "4x5 / 3.5g Bags",
    detail: "The standard eighth bag.",
    mode: "pounds",
  },
  {
    id: "5x4-sideways",
    label: "5x4 (Sideways Bags)",
    detail: "Landscape orientation, same capacity.",
    mode: "pounds",
  },
  {
    id: "2-in-1-split",
    label: "2-in-1 (Split Bags)",
    detail: "Two compartments in one bag.",
    mode: "pounds",
  },
  {
    id: "pound",
    label: "Pound Bags",
    detail: "Full-pound capacity — counted by the bag.",
    mode: "pieces",
  },
];
