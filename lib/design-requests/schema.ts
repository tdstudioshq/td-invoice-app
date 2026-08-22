import { z } from "zod";

import { CUSTOM_DESIGN_TYPES } from "@/lib/design-requests/types";

const uploadedFileSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(300),
  size: z.number().int().positive(),
  mimeType: z.string().min(1).max(200),
});

export const customDesignRequestSubmissionSchema = z.object({
  requestId: z.string().uuid().nullable(),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().email().max(254),
  customerPhone: z.string().trim().min(1).max(40),
  instagramUsername: z.string().trim().min(1).max(100),
  designType: z.enum(CUSTOM_DESIGN_TYPES),
  notes: z.string().trim().min(1).max(4000),
  assets: z.array(uploadedFileSchema).max(10),
  website: z.string().max(200),
  startedAt: z.number().int().positive(),
});

export type CustomDesignRequestSubmission = z.infer<
  typeof customDesignRequestSubmissionSchema
>;
