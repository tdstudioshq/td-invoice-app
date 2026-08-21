import { z } from "zod";

import { MAX_IMAGES } from "./limits";
import { BAG_GRID_EXPORT_FORMATS } from "./types";

/**
 * Validates the `meta` field of `POST /api/bag-mockup-grid/generate`
 * server-side (zod, same convention as every Server Action / route in this
 * app). There's no per-image transform here (always auto cover-fit) — `order`
 * is simply the final grid order, each entry the multipart field key
 * (`file:<id>`) for that image.
 */
export const exportRequestSchema = z.object({
  format: z.enum(BAG_GRID_EXPORT_FORMATS),
  dpi: z.union([z.literal(72), z.literal(150), z.literal(300)]),
  order: z.array(z.string().min(1)).min(1).max(MAX_IMAGES),
});

export type ExportRequest = z.infer<typeof exportRequestSchema>;
