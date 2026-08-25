import { z } from "zod";

import {
  MAX_ITEM_QUANTITY,
  MAX_JOB_FILES,
  MAX_JOB_ITEMS,
  MAX_JOB_NAME_LENGTH,
  MAX_JOB_NOTES_LENGTH,
  PARTNER_PRODUCT_FINISHES,
  PARTNER_PRODUCT_TYPES,
  type PartnerProductFinish,
  type PartnerProductType,
} from "@/lib/partner-jobs/types";
import { MAX_PARTNER_FILENAME_LENGTH } from "@/lib/partner-jobs/uploads";

/**
 * Validation for the partner job form.
 *
 * Server- and client-safe. The form imports the field schemas to drive inline
 * errors and the submit gate; the server action parses
 * `partnerJobSubmissionSchema` and treats THAT as authoritative — a submission
 * that never touched the UI has to pass exactly the same rules. Mirrors
 * lib/mylar-printing/schema.ts.
 *
 * Typed as non-empty tuples of the domain unions (not `string`) so `z.enum`
 * infers the union, which is what lets a parsed submission drop straight into
 * the typed Supabase call without a cast.
 */

const PRODUCT_TYPE_IDS = PARTNER_PRODUCT_TYPES as unknown as [
  PartnerProductType,
  ...PartnerProductType[],
];
const FINISH_IDS = PARTNER_PRODUCT_FINISHES as unknown as [
  PartnerProductFinish,
  ...PartnerProductFinish[],
];

export const jobNameSchema = z
  .string()
  .trim()
  .min(1, "Give this job a name.")
  .max(MAX_JOB_NAME_LENGTH, "That job name is too long.");

export const notesSchema = z
  .string()
  .max(MAX_JOB_NOTES_LENGTH, "Notes are too long — trim them down a little.");

export const quantitySchema = z
  .number()
  .int("Enter a whole number.")
  .min(1, "Quantity must be at least 1.")
  .max(MAX_ITEM_QUANTITY, "That quantity is too large — call it in instead.");

export const jobItemSchema = z.object({
  productType: z.enum(PRODUCT_TYPE_IDS, { message: "Choose a product." }),
  finish: z.enum(FINISH_IDS, { message: "Choose a finish." }),
  quantity: quantitySchema,
});

export type JobItemInput = z.infer<typeof jobItemSchema>;

/**
 * A file the browser claims to have uploaded. Only `path` is load-bearing —
 * the server re-derives size and MIME from Storage and refuses any path outside
 * the caller's own `{companyId}/{jobId}/` prefix.
 */
export const jobFileSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(MAX_PARTNER_FILENAME_LENGTH),
});

export type JobFileInput = z.infer<typeof jobFileSchema>;

export const partnerJobSubmissionSchema = z.object({
  // Minted by the server at the FIRST upload and reused as the design_jobs
  // primary key, which is what makes a double-submit idempotent. Null only when
  // a job carries no files at all: nothing is anchored to the id then, so the
  // action mints one itself. `submitPartnerJobAction` rejects a null id that
  // arrives alongside files, since those object keys could not belong to it.
  jobId: z.string().uuid().nullable(),
  jobName: jobNameSchema,
  notes: notesSchema.default(""),
  items: z
    .array(jobItemSchema)
    .min(1, "Add at least one product.")
    .max(MAX_JOB_ITEMS, `A job can hold at most ${MAX_JOB_ITEMS} products.`),
  files: z
    .array(jobFileSchema)
    .max(MAX_JOB_FILES, `Attach at most ${MAX_JOB_FILES} files.`)
    .default([]),
});

export type PartnerJobSubmission = z.infer<typeof partnerJobSubmissionSchema>;

export const mintPartnerUploadsSchema = z.object({
  /** null on the first mint of a submission; the server returns a fresh uuid. */
  jobId: z.string().uuid().nullable(),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(MAX_PARTNER_FILENAME_LENGTH),
        size: z.number().int().positive(),
        type: z.string().max(160).nullable(),
      }),
    )
    .min(1)
    .max(MAX_JOB_FILES, `Attach at most ${MAX_JOB_FILES} files.`),
});

export const discardPartnerUploadsSchema = z.object({
  jobId: z.string().uuid(),
  paths: z.array(z.string().min(1).max(500)).min(1).max(MAX_JOB_FILES),
});
