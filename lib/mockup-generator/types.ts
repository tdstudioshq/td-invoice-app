/**
 * Shared types for the 8-Piece Mockup Generator (/tools/8pc-mockup-generator).
 * Client- and server-safe: no DOM, no Node, no Supabase imports. The template
 * definition and transform math are the single source of truth used by both the
 * react-konva preview and the sharp/pdf-lib server export, so the two always
 * agree pixel-for-pixel.
 */

export type MockupFitMode = "cover" | "contain";

/** Zoom/pan applied on top of the base cover/contain fit. Units match the
 * template's own coordinate space (pt), so they're independent of on-screen
 * zoom level or export DPI. `rotation` (degrees) is carried for forward
 * compatibility but v1 exposes no UI for it and always leaves it at 0. */
export type MockupTransform = {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
};

export const DEFAULT_TRANSFORM: MockupTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0,
};

export type MockupSlotDefinition = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cornerRadius: number;
};

export type MockupTemplateDefinition = {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  slots: MockupSlotDefinition[];
};

/** Client-side placement state for one occupied slot. The decoded drawable
 * image (for canvas rendering) is kept in a separate cache keyed by slotId,
 * not here — this type stays a plain, comparable description of "what's
 * assigned to this slot," matching what the export request sends the server. */
export type MockupPlacement = {
  slotId: string;
  file: File;
  previewUrl: string;
  originalWidth: number;
  originalHeight: number;
  fitMode: MockupFitMode;
  transform: MockupTransform;
};

export const MOCKUP_EXPORT_FORMATS = ["png", "jpg", "pdf"] as const;
export type MockupExportFormat = (typeof MOCKUP_EXPORT_FORMATS)[number];

export const MOCKUP_EXPORT_DPIS = [150, 300, 600] as const;
export type MockupExportDpi = (typeof MOCKUP_EXPORT_DPIS)[number];
