/**
 * Validation for the Custom Mylar Printing wizard.
 *
 * Server- and client-safe. The client imports the per-step field schemas to
 * drive inline errors and the Continue button's disabled state; the server
 * action parses `mylarInquirySubmissionSchema` and treats THAT as
 * authoritative. Nothing in the wizard UI is trusted — a submission that never
 * touched the UI has to pass exactly the same rules.
 */

import { z } from "zod";

import {
  MAX_ARTWORK_NAME_LENGTH,
  MAX_ARTWORK_BYTES,
} from "@/lib/mylar-printing/artwork";
import {
  MAX_DESIGN_COUNT,
  MAX_QUANTITY,
  MIN_QUANTITY,
  MYLAR_BAG_OPTIONS,
  type MylarBagType,
} from "@/lib/mylar-printing/types";

// Typed as a non-empty tuple of MylarBagType (not string) so z.enum infers the
// union — that inference is what lets the parsed submission drop straight into
// the typed Supabase insert without a cast.
const BAG_TYPE_IDS = MYLAR_BAG_OPTIONS.map((option) => option.id) as [
  MylarBagType,
  ...MylarBagType[],
];

export const bagTypeSchema = z.enum(BAG_TYPE_IDS, {
  message: "Choose a bag type.",
});

export const quantitySchema = z
  .number()
  .int("Enter a whole number of bags.")
  .min(MIN_QUANTITY, `Minimum order is ${MIN_QUANTITY} pieces.`)
  .max(MAX_QUANTITY, "That quantity is too large — get in touch directly.");

export const designCountSchema = z
  .number()
  .int("Enter a whole number of designs.")
  .min(1, "Enter at least 1 design.")
  .max(MAX_DESIGN_COUNT, "That's more designs than we can quote here.");

export const customerNameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(120, "That name is too long.");

export const customerEmailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email.")
  .max(254, "That email is too long.")
  .email("Enter a valid email address.");

export const customerPhoneSchema = z
  .string()
  .trim()
  .max(40, "That phone number is too long.");

export const notesSchema = z
  .string()
  .trim()
  .max(4000, "Please keep notes under 4,000 characters.");

/** One uploaded artwork file, as reported back by the mint/upload round-trip. */
const artworkFileSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(MAX_ARTWORK_NAME_LENGTH),
  size: z.number().int().positive().max(MAX_ARTWORK_BYTES),
  mimeType: z.string().min(1).max(160),
});

export type ArtworkFileInput = z.infer<typeof artworkFileSchema>;

/**
 * The complete submission. `inquiryId` is the uuid the server minted when the
 * customer first uploaded artwork; it becomes the row's primary key AND the
 * artwork path prefix, which is what lets the server prove an artwork object
 * belongs to this submission.
 *
 * It is nullable because a request with no artwork never mints one. The client
 * still generates an id in that case so a retry stays idempotent, but
 * `crypto.randomUUID()` only exists in a secure context — on plain http (a LAN
 * IP while testing on a phone, say) it is undefined, and the server mints the
 * id instead. Null therefore also implies "no artwork to verify".
 *
 * `website` is a honeypot: a real customer never sees the field, so any value
 * means a bot filled the form. `startedAt` is the epoch-ms the wizard mounted,
 * used for the "submitted impossibly fast" heuristic. Both are checked in the
 * action, not here, so the reason for a rejection stays server-side.
 */
export const mylarInquirySubmissionSchema = z
  .object({
    inquiryId: z.string().uuid().nullable(),
    bagType: bagTypeSchema,
    quantity: quantitySchema,
    designCount: designCountSchema,
    artworkComingLater: z.boolean(),
    frontArtwork: artworkFileSchema.nullable(),
    backArtwork: artworkFileSchema.nullable(),
    customerName: customerNameSchema,
    customerEmail: customerEmailSchema,
    customerPhone: customerPhoneSchema,
    notes: notesSchema,
    website: z.string().max(200),
    startedAt: z.number().int().nonnegative(),
  })
  // "Send artwork later" and actually attaching artwork are mutually
  // exclusive — otherwise the summary and the notification email disagree
  // about whether files are coming.
  .refine(
    (value) =>
      !value.artworkComingLater || (!value.frontArtwork && !value.backArtwork),
    {
      message: "Uncheck “I’ll send my artwork later” to attach files.",
      path: ["artworkComingLater"],
    },
  );

export type MylarInquirySubmission = z.infer<
  typeof mylarInquirySubmissionSchema
>;

/** Input to the signed-upload-URL mint action. */
export const mintArtworkUploadSchema = z.object({
  /** Omitted on the first upload; the server mints and returns one. */
  inquiryId: z.string().uuid().nullable(),
  side: z.enum(["front", "back"]),
  name: z.string().min(1).max(MAX_ARTWORK_NAME_LENGTH),
  size: z.number().int().positive(),
  type: z.string().max(160).nullable(),
});

/**
 * Field-level check used by the wizard to decide whether a step may advance.
 * Returns the first message, or null when the value is acceptable.
 */
export function firstError(
  schema: z.ZodType<unknown>,
  value: unknown,
): string | null {
  const result = schema.safeParse(value);
  return result.success
    ? null
    : (result.error.issues[0]?.message ?? "That value isn't valid.");
}
