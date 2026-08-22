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
  type MylarContactMethod,
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

/**
 * Digits-only sanity check, not a format. Real numbers arrive as "(929)
 * 752-8373", "+1 929 752 8373", and "9297528373"; normalising to digits and
 * bounding the count accepts all of them plus every international shape, while
 * still rejecting "call me" and a half-typed number. NANP is 10, the E.164
 * ceiling is 15.
 */
export function isLikelyPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export const customerPhoneSchema = z
  .string()
  .trim()
  .max(40, "That phone number is too long.")
  // Only checked once something has been typed — the field itself stays
  // optional, and whether it is REQUIRED depends on the contact method (see
  // contactPhoneError).
  .refine(
    (value) => value === "" || isLikelyPhone(value),
    "Enter a valid phone number.",
  );

export const brandNameSchema = z
  .string()
  .trim()
  .max(120, "That brand name is too long.");

export const contactMethodSchema = z.enum(["text", "call", "email"], {
  message: "Tell us how you'd like to be contacted.",
});

/**
 * Requested completion date, as the `YYYY-MM-DD` an `<input type="date">`
 * produces, or "" when not given.
 *
 * Format and a wide year range only. A past date is NOT rejected: the customer
 * may be in a timezone where it is still yesterday, and no scheduling logic
 * reads this column, so the worst case is a date the studio queries by hand.
 * Blocking a whole lead over it would cost far more than it saves.
 */
export const neededBySchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Enter a valid date.",
  })
  .refine(
    (value) => {
      if (value === "") return true;
      const parsed = Date.parse(`${value}T12:00:00Z`);
      if (Number.isNaN(parsed)) return false;
      const year = Number(value.slice(0, 4));
      return year >= 2020 && year <= 2100;
    },
    { message: "Enter a valid date." },
  );

/**
 * The one cross-field rule on step 5: picking Text or Call is a promise the
 * studio can only keep with a number to reach.
 *
 * Lives here rather than inside the submission schema's refine so the step can
 * show the same sentence inline, next to the field that fixes it, instead of
 * the customer discovering it at submit time.
 */
export function contactPhoneError(
  method: MylarContactMethod | null | undefined,
  phone: string,
): string | null {
  if (method !== "text" && method !== "call") return null;
  const trimmed = phone.trim();
  if (!trimmed) {
    return method === "text"
      ? "Add a phone number we can text."
      : "Add a phone number we can call.";
  }
  if (!isLikelyPhone(trimmed)) return "Enter a valid phone number.";
  return null;
}

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
 * One design: a stable id, its bag allocation, and up to one file per side.
 *
 * The id is a uuid because it becomes both the `mylar_designs` primary key and
 * a segment of every artwork object key for that design — an index would break
 * the moment a design is removed, silently re-pointing the next design's files.
 */
export const designSchema = z.object({
  id: z.string().uuid(),
  quantity: z
    .number()
    .int("Enter a whole number of bags.")
    .min(1, "Give every design at least 1 bag.")
    .max(MAX_QUANTITY, "That quantity is too large."),
  frontArtwork: artworkFileSchema.nullable(),
  backArtwork: artworkFileSchema.nullable(),
});

export type DesignInput = z.infer<typeof designSchema>;

export const designsSchema = z
  .array(designSchema)
  .min(1, "Add at least one design.")
  .max(MAX_DESIGN_COUNT, "That's more designs than we can quote here.")
  // Two designs sharing an id would collide on the primary key and, worse,
  // share an artwork prefix — so one could claim the other's files.
  .refine(
    (designs) => new Set(designs.map((d) => d.id)).size === designs.length,
    { message: "Those designs aren't distinct. Reload and try again." },
  );

/** Bags assigned across every design. Shared by the wizard and the action. */
export function totalAllocated(
  designs: readonly { quantity: number }[],
): number {
  return designs.reduce(
    (sum, design) => sum + (Number.isFinite(design.quantity) ? design.quantity : 0),
    0,
  );
}

/**
 * The allocation rule, in one place so the Continue gate, the submit-time
 * client check, and the server all read the identical sentence. Returns a
 * customer-facing message, or null when the split balances.
 */
export function allocationError(
  designs: readonly { quantity: number }[],
  orderQuantity: number,
): string | null {
  if (designs.length === 0) return "Add at least one design.";
  if (designs.some((design) => !Number.isInteger(design.quantity) || design.quantity < 1)) {
    return "Give every design at least 1 bag.";
  }
  const allocated = totalAllocated(designs);
  if (allocated < orderQuantity) {
    const short = orderQuantity - allocated;
    return `${short.toLocaleString()} ${short === 1 ? "bag" : "bags"} still need to be assigned to a design.`;
  }
  if (allocated > orderQuantity) {
    const over = allocated - orderQuantity;
    return `You've allocated ${over.toLocaleString()} more ${over === 1 ? "bag" : "bags"} than your order quantity.`;
  }
  return null;
}

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
    designs: designsSchema,
    customerName: customerNameSchema,
    customerEmail: customerEmailSchema,
    customerPhone: customerPhoneSchema,
    brandName: brandNameSchema,
    contactMethod: contactMethodSchema,
    neededBy: neededBySchema,
    notes: notesSchema,
    website: z.string().max(200),
    startedAt: z.number().int().nonnegative(),
  })
  // Text and Call are only worth recording if there is a number behind them.
  // Same sentence the step shows inline — one rule, one place.
  .refine(
    (value) => contactPhoneError(value.contactMethod, value.customerPhone) === null,
    {
      message: "Add a phone number so we can reach you that way.",
      path: ["customerPhone"],
    },
  )
  // "Send artwork later" and actually attaching artwork are mutually
  // exclusive — otherwise the summary and the notification email disagree
  // about whether files are coming. Design ALLOCATIONS are unaffected: a
  // deferred-artwork order still records how the bags split.
  .refine(
    (value) =>
      !value.artworkComingLater ||
      value.designs.every(
        (design) => !design.frontArtwork && !design.backArtwork,
      ),
    {
      message: "Uncheck “I’ll send my artwork later” to attach files.",
      path: ["artworkComingLater"],
    },
  )
  // The allocation must balance. Re-checked here rather than trusted from the
  // wizard: the client gate is UX, this is the rule.
  .refine((value) => allocationError(value.designs, value.quantity) === null, {
    message: "Your design quantities don't add up to your order quantity.",
    path: ["designs"],
  })
  // designCount is what the customer said on step 3; designs.length is what
  // they actually built. Letting them disagree would put a figure in the quote
  // that contradicts the artwork attached to it.
  .refine((value) => value.designs.length === value.designCount, {
    message: "Your number of designs doesn't match the designs you set up.",
    path: ["designs"],
  });

export type MylarInquirySubmission = z.infer<
  typeof mylarInquirySubmissionSchema
>;

/** Input to the signed-upload-URL mint action. */
export const mintArtworkUploadSchema = z.object({
  /** Omitted on the first upload; the server mints and returns one. */
  inquiryId: z.string().uuid().nullable(),
  /** The design this file belongs to. Client-generated, becomes the row id. */
  designId: z.string().uuid(),
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
