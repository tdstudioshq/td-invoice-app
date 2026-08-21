"use client";

import { useCallback, useMemo } from "react";
import type Konva from "konva";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";

import { baseFitSize, clamp, computeDrawRect } from "@/lib/mockup-generator/geometry";
import type {
  MockupFitMode,
  MockupPlacement,
  MockupTemplateDefinition,
  MockupTransform,
} from "@/lib/mockup-generator/types";

/** Drawable image sources decoded client-side (see decodeMockupImage in
 * mockup-sheet-generator.tsx) — both expose the natural pixel size Konva and
 * our geometry math need. */
export type DrawableImage = (HTMLImageElement | ImageBitmap) & {
  width: number;
  height: number;
};

export interface SheetCanvasProps {
  template: MockupTemplateDefinition;
  /** On-screen width in CSS px; height is derived from the template's aspect
   * ratio so the whole sheet always fits without distortion. */
  containerWidth: number;
  placements: Partial<Record<string, MockupPlacement>>;
  images: Partial<Record<string, DrawableImage>>;
  selectedSlotId: string | null;
  onSlotClick: (slotId: string) => void;
  onPanChange: (slotId: string, offsetX: number, offsetY: number) => void;
}

/** Trace a rounded-rect path on a raw canvas context — used as a Konva
 * `clipFunc` so artwork is clipped to the slot window exactly like the
 * template (and like the exported sheet's SVG clipPath). */
function traceRoundedRect(
  ctx: Konva.Context,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

interface SlotBoundsInput {
  slotX: number;
  slotY: number;
  slotWidth: number;
  slotHeight: number;
  imageWidth: number;
  imageHeight: number;
  fitMode: MockupFitMode;
  scale: number;
}

/** Center + max pan range (template units) for an image at a given zoom —
 * shared by dragBoundFunc (live clamping) and onDragEnd (committing offset). */
function slotDragBounds({
  slotX,
  slotY,
  slotWidth,
  slotHeight,
  imageWidth,
  imageHeight,
  fitMode,
  scale,
}: SlotBoundsInput) {
  const base = baseFitSize(imageWidth, imageHeight, slotWidth, slotHeight, fitMode);
  const width = base.width * Math.max(scale, 0.01);
  const height = base.height * Math.max(scale, 0.01);
  const centerX = slotX + (slotWidth - width) / 2;
  const centerY = slotY + (slotHeight - height) / 2;
  return {
    width,
    height,
    centerX,
    centerY,
    maxOffsetX: Math.max(0, (width - slotWidth) / 2),
    maxOffsetY: Math.max(0, (height - slotHeight) / 2),
  };
}

function SlotContent({
  slot,
  placement,
  image,
  selected,
  screenScale,
  onSlotClick,
  onPanChange,
}: {
  slot: MockupTemplateDefinition["slots"][number];
  placement: MockupPlacement | undefined;
  image: DrawableImage | undefined;
  selected: boolean;
  screenScale: number;
  onSlotClick: (slotId: string) => void;
  onPanChange: (slotId: string, offsetX: number, offsetY: number) => void;
}) {
  const clipFunc = useCallback(
    (ctx: Konva.Context) =>
      traceRoundedRect(ctx, slot.x, slot.y, slot.width, slot.height, slot.cornerRadius),
    [slot.x, slot.y, slot.width, slot.height, slot.cornerRadius],
  );

  const drawRect =
    placement && image
      ? computeDrawRect(slot, image.width, image.height, placement.fitMode, placement.transform)
      : null;

  const handleDragEnd = useCallback(
    (transform: MockupTransform, fitMode: MockupFitMode) =>
      (e: Konva.KonvaEventObject<DragEvent>) => {
        if (!image) return;
        const bounds = slotDragBounds({
          slotX: slot.x,
          slotY: slot.y,
          slotWidth: slot.width,
          slotHeight: slot.height,
          imageWidth: image.width,
          imageHeight: image.height,
          fitMode,
          scale: transform.scale,
        });
        const node = e.target;
        onPanChange(
          slot.id,
          clamp(node.x() - bounds.centerX, -bounds.maxOffsetX, bounds.maxOffsetX),
          clamp(node.y() - bounds.centerY, -bounds.maxOffsetY, bounds.maxOffsetY),
        );
      },
    [image, slot.id, slot.x, slot.y, slot.width, slot.height, onPanChange],
  );

  const dragBoundFunc = useCallback(
    function (this: Konva.Node, pos: { x: number; y: number }) {
      if (!image || !placement) return pos;
      const bounds = slotDragBounds({
        slotX: slot.x,
        slotY: slot.y,
        slotWidth: slot.width,
        slotHeight: slot.height,
        imageWidth: image.width,
        imageHeight: image.height,
        fitMode: placement.fitMode,
        scale: placement.transform.scale,
      });
      const templateX = pos.x / screenScale;
      const templateY = pos.y / screenScale;
      return {
        x: clamp(templateX, bounds.centerX - bounds.maxOffsetX, bounds.centerX + bounds.maxOffsetX) * screenScale,
        y: clamp(templateY, bounds.centerY - bounds.maxOffsetY, bounds.centerY + bounds.maxOffsetY) * screenScale,
      };
    },
    [image, placement, slot.x, slot.y, slot.width, slot.height, screenScale],
  );

  return (
    <Group>
      {/* Base + click/drop target, also visible as the white seal-margin look
          the export uses for "contain" gaps. */}
      <Rect
        x={slot.x}
        y={slot.y}
        width={slot.width}
        height={slot.height}
        cornerRadius={slot.cornerRadius}
        fill={placement ? "#ffffff" : "#f4f4f5"}
        dash={placement ? undefined : [6, 5]}
        stroke={placement ? undefined : "#a1a1aa"}
        strokeWidth={placement ? 0 : 1.5 / screenScale}
        onClick={() => onSlotClick(slot.id)}
        onTap={() => onSlotClick(slot.id)}
      />

      {!placement && (
        <Text
          x={slot.x}
          y={slot.y + slot.height / 2 - 14}
          width={slot.width}
          align="center"
          text="+"
          fontSize={28 / screenScale}
          fill="#a1a1aa"
          listening={false}
        />
      )}

      {placement && image && drawRect && (
        <Group clipFunc={clipFunc}>
          <KonvaImage
            image={image}
            x={drawRect.x}
            y={drawRect.y}
            width={drawRect.width}
            height={drawRect.height}
            draggable={selected}
            dragBoundFunc={dragBoundFunc}
            onDragEnd={handleDragEnd(placement.transform, placement.fitMode)}
            onClick={() => onSlotClick(slot.id)}
            onTap={() => onSlotClick(slot.id)}
          />
        </Group>
      )}

      {selected && (
        <Rect
          x={slot.x}
          y={slot.y}
          width={slot.width}
          height={slot.height}
          cornerRadius={slot.cornerRadius}
          stroke="#6366f1"
          strokeWidth={2 / screenScale}
          listening={false}
        />
      )}
    </Group>
  );
}

export function SheetCanvas({
  template,
  containerWidth,
  placements,
  images,
  selectedSlotId,
  onSlotClick,
  onPanChange,
}: SheetCanvasProps) {
  const screenScale = containerWidth > 0 ? containerWidth / template.width : 0;
  const containerHeight = containerWidth * (template.height / template.width);

  const slots = useMemo(() => template.slots, [template]);

  if (screenScale <= 0) return null;

  return (
    <Stage width={containerWidth} height={containerHeight}>
      <Layer scaleX={screenScale} scaleY={screenScale}>
        <Rect x={0} y={0} width={template.width} height={template.height} fill={template.backgroundColor} />
        {slots.map((slot) => (
          <SlotContent
            key={slot.id}
            slot={slot}
            placement={placements[slot.id]}
            image={images[slot.id]}
            selected={selectedSlotId === slot.id}
            screenScale={screenScale}
            onSlotClick={onSlotClick}
            onPanChange={onPanChange}
          />
        ))}
      </Layer>
    </Stage>
  );
}
