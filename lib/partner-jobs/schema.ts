import { z } from "zod";

import {
  DESIGN_JOB_STATUSES,
  MAX_ITEM_NOTES_LENGTH,
  MAX_ITEM_QUANTITY,
  MAX_JOB_FILES,
  MAX_JOB_ITEMS,
  MAX_JOB_NAME_LENGTH,
  MAX_JOB_NOTES_LENGTH,
  PARTNER_PRODUCT_FINISHES,
  PARTNER_PRODUCT_TYPES,
  type DesignJobStatus,
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
const STATUS_IDS = DESIGN_JOB_STATUSES as unknown as [
  DesignJobStatus,
  ...DesignJobStatus[],
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

export const itemNotesSchema = z
  .string()
  .max(
    MAX_ITEM_NOTES_LENGTH,
    "Notes for this product are too long — trim them down a little.",
  );

export const jobItemSchema = z.object({
  /**
   * Minted in the BROWSER, exactly as a mylar design's id is, and for the same
   * reason: a file is attached to a product before either row exists, so the
   * two halves of the submission have to agree on the id up front.
   *
   * Accepting it is safe because it is only ever a claim about the caller's own
   * job: `update_design_job` refuses an id that already belongs to a different
   * job, and RLS keeps another company's rows invisible either way.
   */
  id: z.string().uuid(),
  productType: z.enum(PRODUCT_TYPE_IDS, { message: "Choose a product." }),
  finish: z.enum(FINISH_IDS, { message: "Choose a finish." }),
  quantity: quantitySchema,
  notes: itemNotesSchema.default(""),
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
  /**
   * The product this file is artwork for. Null is a legitimate value meaning
   * "the job as a whole" — that is what every file filed before migration
   * 20260827000000 is, and what the edit form leaves those files as.
   *
   * Not trusted: the RPC refuses an id that is not on the job being written,
   * so a forged one fails the transaction rather than filing artwork against
   * somebody else's product.
   */
  itemId: z.string().uuid().nullable().default(null),
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

/**
 * An edit. `addFiles` are objects already uploaded to this job's prefix and
 * awaiting a row; `removeFileIds` are rows whose objects should go with them.
 * The server re-derives every path and never trusts these to point anywhere.
 */
export const partnerJobEditSchema = z.object({
  jobId: z.string().uuid(),
  jobName: jobNameSchema,
  notes: notesSchema.default(""),
  items: z
    .array(jobItemSchema)
    .min(1, "Add at least one product.")
    .max(MAX_JOB_ITEMS, `A job can hold at most ${MAX_JOB_ITEMS} products.`),
  addFiles: z.array(jobFileSchema).max(MAX_JOB_FILES).default([]),
  removeFileIds: z.array(z.string().uuid()).max(MAX_JOB_FILES).default([]),
});

export type PartnerJobEdit = z.infer<typeof partnerJobEditSchema>;

export const deletePartnerJobSchema = z.object({ jobId: z.string().uuid() });

/** The rep's quick Done checkbox: a job id and its requested boolean state. */
export const setPartnerJobDoneSchema = z.object({
  jobId: z.string().uuid(),
  done: z.boolean(),
});

/** Any of the three lifecycle states exposed by the partner jobs dropdown. */
export const setPartnerJobStatusSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(STATUS_IDS),
});
