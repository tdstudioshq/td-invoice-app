import { z } from "zod";

import { MOCKUP_EXPORT_FORMATS } from "./types";

/**
 * Validates the `meta` field of an export request (`POST
 * /api/mockup-sheet/generate`) server-side, same convention as every other
 * Server Action / route in the app (zod, validated inside the handler — see
 * CLAUDE.md "Forms, validation"). The actual image bytes travel alongside as
 * separate multipart file parts, keyed by slot id; this schema only covers
 * the placement metadata (which slot, which fit mode, what zoom/pan).
 */

const transformSchema = z.object({
  offsetX: z.number().finite(),
  offsetY: z.number().finite(),
  scale: z.number().finite().min(0.01).max(20),
  rotation: z.number().finite(),
});

const placementSchema = z.object({
  slotId: z.string().min(1),
  fitMode: z.enum(["cover", "contain"]),
  transform: transformSchema,
});

export const exportRequestSchema = z.object({
  format: z.enum(MOCKUP_EXPORT_FORMATS),
  dpi: z.union([z.literal(150), z.literal(300), z.literal(600)]),
  background: z.enum(["white", "transparent"]),
  placements: z.array(placementSchema).min(1).max(8),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;
