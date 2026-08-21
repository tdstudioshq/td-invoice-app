import type { MockupTemplateDefinition } from "../types";

/**
 * The built-in 8-slot sheet template — 4 columns × 2 rows of rounded-rectangle
 * artwork windows, one per bag.
 *
 * Geometry was measured from the reference `8pc-template.pdf` (18×10.5in /
 * 1296×756pt landscape sheet, decoded via its raw content stream) rather than
 * hand-guessed: each of its 8 image placements sits behind an identical
 * rounded-rect clip path, so the sheet reduces to one clean grid —
 * column pitch, row pitch, slot size, and corner radius are each constant to
 * within Illustrator export noise (~0.3pt) across all 8 positions. The
 * constants below are that grid; slots are derived, not hand-listed, so the
 * template stays internally consistent if it's ever retuned.
 *
 * Coordinates are top-left origin, y-down (matches canvas/DOM), unlike the
 * source PDF's bottom-left/y-up space.
 */

const PAGE_WIDTH = 1296;
const PAGE_HEIGHT = 756;

const COLUMNS = 4;
const ROWS = 2;

const SLOT_WIDTH = 271.06;
const SLOT_HEIGHT = 340.45;
const CORNER_RADIUS = 20.67;

const MARGIN_LEFT = 43.92;
const GUTTER_X = 41.63;

const MARGIN_TOP = 24.15;
const GUTTER_Y = 34.73;

function buildSlots(): MockupTemplateDefinition["slots"] {
  const slots: MockupTemplateDefinition["slots"] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS; col++) {
      slots.push({
        id: String(row * COLUMNS + col + 1),
        x: MARGIN_LEFT + col * (SLOT_WIDTH + GUTTER_X),
        y: MARGIN_TOP + row * (SLOT_HEIGHT + GUTTER_Y),
        width: SLOT_WIDTH,
        height: SLOT_HEIGHT,
        cornerRadius: CORNER_RADIUS,
      });
    }
  }
  return slots;
}

export const EIGHT_PIECE_TEMPLATE: MockupTemplateDefinition = {
  id: "eight-piece",
  name: "8-Piece Sheet",
  width: PAGE_WIDTH,
  height: PAGE_HEIGHT,
  backgroundColor: "#ffffff",
  slots: buildSlots(),
};
