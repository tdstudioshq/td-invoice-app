import type { MockupFitMode, MockupSlotDefinition, MockupTransform } from "./types";

/**
 * Pure placement math — no DOM, no Node, no canvas/image APIs. This is the
 * single source of truth for "given a slot, an image's natural size, a fit
 * mode, and a zoom/pan transform, what rectangle does the image draw at,"
 * shared verbatim by the react-konva preview (client) and the sharp compose
 * step (server) so exported output always matches what was previewed —
 * independent of the viewer's screen size or canvas zoom level.
 */

export function clamp(value: number, min: number, max: number): number {
  if (min > max) return 0;
  return Math.min(max, Math.max(min, value));
}

/** The aspect-preserved size that exactly covers or is exactly contained by
 * a `width`×`height` box, before any user zoom/pan is applied (scale === 1). */
export function baseFitSize(
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
  fitMode: MockupFitMode,
): { width: number; height: number } {
  const imageRatio = imageWidth / imageHeight;
  const boxRatio = width / height;
  const widthLimited = fitMode === "cover" ? imageRatio < boxRatio : imageRatio > boxRatio;
  return widthLimited
    ? { width, height: width / imageRatio }
    : { width: height * imageRatio, height };
}

export interface DrawRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Offset actually applied after clamping — feed this back into state so
   * a drag that hits the clamp boundary doesn't silently drift out of sync. */
  offsetX: number;
  offsetY: number;
}

/**
 * Resolve where an image draws inside a slot, in the template's own
 * coordinate space (same units as `slot.x/y/width/height`). The result is
 * always clamped so the drawn rect can never leave a gap inside the slot on
 * an axis where it's larger than the slot (cover mode always fills; contain
 * mode is simply centered once it's smaller than the slot on that axis).
 *
 * Clamping assumes `transform.rotation === 0`, the only case v1 renders.
 */
export function computeDrawRect(
  slot: Pick<MockupSlotDefinition, "x" | "y" | "width" | "height">,
  imageWidth: number,
  imageHeight: number,
  fitMode: MockupFitMode,
  transform: MockupTransform,
): DrawRect {
  const scale = Math.max(transform.scale, 0.01);
  const base = baseFitSize(imageWidth, imageHeight, slot.width, slot.height, fitMode);
  const width = base.width * scale;
  const height = base.height * scale;

  const maxOffsetX = Math.max(0, (width - slot.width) / 2);
  const maxOffsetY = Math.max(0, (height - slot.height) / 2);
  const offsetX = clamp(transform.offsetX, -maxOffsetX, maxOffsetX);
  const offsetY = clamp(transform.offsetY, -maxOffsetY, maxOffsetY);

  return {
    x: slot.x + (slot.width - width) / 2 + offsetX,
    y: slot.y + (slot.height - height) / 2 + offsetY,
    width,
    height,
    offsetX,
    offsetY,
  };
}
