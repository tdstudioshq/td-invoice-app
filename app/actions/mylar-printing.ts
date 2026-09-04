"use server";

import { randomInt, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  MIN_FILL_MS,
  SUBMIT_WINDOW_MAX,
  SUBMIT_WINDOW_MS,
  checkBurst,
  submitterHash,
} from "@/lib/mylar-printing/abuse";
import { reportError, summarizePaths } from "@/lib/observability/report-error";
import {
  MAX_ARTWORK_BYTES,
  artworkExtensionOf,
  buildArtworkPath,
  isAllowedArtworkExtension,
  isOwnArtworkPath,
  resolveArtworkContentType,
  validateArtworkFile,
} from "@/lib/mylar-printing/artwork";
import {
  mintArtworkUploadSchema,
  mylarInquirySubmissionSchema,
  type ArtworkFileInput,
  type DesignInput,
} from "@/lib/mylar-printing/schema";
import {
  ARTWORK_SIDES,
  bagTypeLabel,
  contactMethodLabel,
  type MylarBagType,
  type MylarContactMethod,
} from "@/lib/mylar-printing/types";
import { getAdminEmails } from "@/lib/auth";
import {
  EMAIL_FROM,
  getResend,
  getSiteUrl,
  isResendConfigured,
} from "@/lib/email/client";
import { mylarInquiryEmail } from "@/lib/email/templates";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

/**
 * Server-side submission path for the PUBLIC Custom Mylar Printing wizard
 * (/mylar-printing). There is no session here — the customer is anonymous —
 * so this is the entire trust boundary.
 *
 * Why the service-role client rather than an anon INSERT policy: granting anon
 * write access to mylar_printing_inquiries would let anybody insert arbitrary
 * rows straight through PostgREST, skipping validation, the honeypot, and the
 * rate limit. Instead the table has RLS on with NO policies (migration 0023),
 * so it is unreachable except from here and from the requireAdmin()-guarded
 * dashboard. Same shape as app/actions/design-requests.ts, one step stricter.
 *
 * Layers, in order, on every submission:
 *   1. zod parse of the whole payload (authoritative — the wizard's own checks
 *      are UX only).
 *   2. Honeypot + minimum-fill-time heuristic.
 *   3. In-process burst limit, then the durable per-submitter DB limit.
 *   4. Artwork objects verified against Storage: the key must live under THIS
 *      inquiry's uuid prefix, and size/MIME are read back from storage.info()
 *      rather than believed from the browser.
 *   5. Insert; on failure the just-verified objects are removed so no orphan
 *      outlives a failed submission.
 *   6. Notification email — best effort, never fails a stored inquiry.
 */

const BUCKET = "mylar-artwork";

/** Uploads a single caller may mint in a burst (2 sides + a few retries). */
const MINT_BURST_MAX = 12;
const MINT_BURST_WINDOW_MS = 5 * 60 * 1000;

/**
 * Submission ATTEMPTS allowed per caller in-process. Deliberately looser than
 * SUBMIT_WINDOW_MAX (which counts rows that actually landed): a failed attempt
 * shouldn't spend the customer's budget, so the durable DB limit is the one
 * that normally binds. This one only matters when the DB check can't run.
 */
const SUBMIT_BURST_MAX = 5;

/** Shown for anything we don't want to explain to a possible attacker. */
const GENERIC_REJECTION =
  "We couldn't process that request. Please try again, or text us and we'll take the order directly.";

export interface MylarUploadTicket {
  /** The inquiry uuid to reuse for every later upload and for the submission. */
  inquiryId: string;
  path: string;
  signedUrl: string;
  token: string;
  contentType: string;
}

export type MintArtworkResult =
  | { error: string }
  | { ticket: MylarUploadTicket };

/**
 * Mint a one-shot signed upload URL for a single artwork file. The browser PUTs
 * the bytes straight to Storage with it, so file bytes never pass through a
 * Server Action (Next caps those at ~4 MB) or a Vercel function body.
 *
 * The FIRST call passes `inquiryId: null` and gets a fresh uuid back; the
 * wizard reuses it for the other side and for the submission, so both artwork
 * keys and the eventual row all share one identifier.
 */
export async function mintMylarArtworkUploadAction(input: {
  inquiryId: string | null;
  designId: string;
  side: "front" | "back";
  name: string;
  size: number;
  type: string | null;
}): Promise<MintArtworkResult> {
  if (!isSupabaseAdminConfigured()) {
    return { error: "Artwork uploads aren't available right now." };
  }

  const parsed = mintArtworkUploadSchema.safeParse(input);
  if (!parsed.success) return { error: GENERIC_REJECTION };
  const { designId, side, name, size, type } = parsed.data;

  const hash = await submitterHash();
  if (
    hash &&
    !checkBurst(`mylar:mint:${hash}`, MINT_BURST_MAX, MINT_BURST_WINDOW_MS)
  ) {
    return {
      error: "That's a lot of uploads in a row. Give it a minute and retry.",
    };
  }

  const invalid = validateArtworkFile(name, size, type);
  if (invalid) return { error: invalid };

  // A caller-supplied id is a uuid the mint schema already validated, and it
  // only ever scopes them to their own folder — the submission re-derives the
  // same prefix, so it cannot be used to reach another inquiry's artwork.
  const inquiryId = parsed.data.inquiryId ?? randomUUID();
  const path = buildArtworkPath(inquiryId, designId, side, randomUUID(), name);

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error("mintMylarArtworkUploadAction", error?.message);
    return { error: "Couldn't start that upload. Please try again." };
  }

  return {
    ticket: {
      inquiryId,
      path: data.path,
      signedUrl: data.signedUrl,
      token: data.token,
      contentType: resolveArtworkContentType(name, type),
    },
  };
}

export type SubmitInquiryResult =
  | { error: string; fieldErrors?: Record<string, string> }
  | { referenceNumber: string };

/**
 * Reference alphabet: Crockford-ish, with I/O/0/1 removed so a number read off
 * a screen or over the phone can't be transcribed wrong. 32 symbols × 6
 * characters ≈ 1.07 billion combinations, drawn with `randomInt` (CSPRNG,
 * rejection-sampled so the distribution stays flat). Never derived from the
 * row's uuid, and never sequential — the reference leaks no order volume.
 * Uniqueness is still enforced by the DB constraint; a collision just retries.
 */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateReferenceNumber(): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `MYL-${out}`;
}

type VerifiedArtwork = {
  path: string;
  name: string;
  size: number;
  mimeType: string;
};

/**
 * Confirm an uploaded object really exists, really belongs to this inquiry, and
 * really is a printable file — then take its size and MIME from Storage rather
 * than from the browser. Returns a message on rejection.
 */
async function verifyArtwork(
  supabase: ReturnType<typeof createAdminClient>,
  inquiryId: string,
  designId: string,
  designNumber: number,
  side: "front" | "back",
  file: ArtworkFileInput,
): Promise<{ ok: true; value: VerifiedArtwork } | { ok: false; error: string }> {
  const label = `Design ${designNumber} ${side === "front" ? "front" : "back"}`;

  // A path outside this inquiry's own prefix is never touched — not read, not
  // removed. It may well belong to somebody else's request.
  if (!isOwnArtworkPath(file.path, inquiryId, side, designId)) {
    return { ok: false, error: GENERIC_REJECTION };
  }
  const ext = artworkExtensionOf(file.name);
  if (!isAllowedArtworkExtension(ext)) {
    return { ok: false, error: `${label} artwork isn't a printable file type.` };
  }

  const { data: info, error } = await supabase.storage
    .from(BUCKET)
    .info(file.path);
  if (error || !info) {
    return {
      ok: false,
      error: `${label} artwork didn't finish uploading. Go back and upload it again.`,
    };
  }

  // Authoritative values — the browser's numbers are only ever a hint.
  const size = Number(info.size ?? 0);
  if (size <= 0) {
    return {
      ok: false,
      error: `${label} artwork uploaded empty. Go back and upload it again.`,
    };
  }
  if (size > MAX_ARTWORK_BYTES) {
    return { ok: false, error: `${label} artwork is too large.` };
  }

  return {
    ok: true,
    value: {
      path: file.path,
      name: file.name,
      size,
      mimeType:
        info.contentType || resolveArtworkContentType(file.name, file.mimeType),
    },
  };
}

/** Best-effort orphan cleanup — a failed submission must not leave bytes behind. */
async function removeObjects(
  supabase: ReturnType<typeof createAdminClient>,
  paths: string[],
) {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(BUCKET).remove(paths);
  } catch (err) {
    // Artwork keys carry the customer's original filename — summarize instead.
    reportError("mylar artwork cleanup", err, summarizePaths(paths));
  }
}

export async function submitMylarInquiryAction(
  input: unknown,
): Promise<SubmitInquiryResult> {
  if (!isSupabaseAdminConfigured()) {
    return {
      error:
        "Requests aren't being accepted right now. Please text us and we'll take the order directly.",
    };
  }

  const parsed = mylarInquirySubmissionSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      error: "Please check the highlighted details and try again.",
      fieldErrors,
    };
  }
  const submission = parsed.data;

  // --- Anti-spam. Reasons stay server-side; the caller gets one flat message.
  if (submission.website.trim().length > 0) {
    console.warn("mylar inquiry rejected: honeypot filled");
    return { error: GENERIC_REJECTION };
  }
  const elapsed = Date.now() - submission.startedAt;
  if (elapsed >= 0 && elapsed < MIN_FILL_MS) {
    console.warn(`mylar inquiry rejected: submitted in ${elapsed}ms`);
    return { error: GENERIC_REJECTION };
  }

  const hash = await submitterHash();
  if (hash && !checkBurst(`mylar:submit:${hash}`, SUBMIT_BURST_MAX, SUBMIT_WINDOW_MS)) {
    return {
      error: "You've sent a few requests already. Please wait a few minutes.",
    };
  }

  const supabase = createAdminClient();

  // Durable limit: unlike the in-process counter above, this is shared across
  // instances and survives restarts.
  if (hash) {
    const since = new Date(Date.now() - SUBMIT_WINDOW_MS).toISOString();
    const { count, error } = await supabase
      .from("mylar_printing_inquiries")
      .select("id", { count: "exact", head: true })
      .eq("submitter_hash", hash)
      .gte("created_at", since);
    if (!error && (count ?? 0) >= SUBMIT_WINDOW_MAX) {
      return {
        error:
          "You've sent a few requests already. Please wait a few minutes before sending another.",
      };
    }
  }

  // A null id means the browser had no Web Crypto (insecure origin) and no
  // artwork was uploaded — there is nothing to prove ownership of, so minting
  // here is safe. The only thing lost is retry idempotency for that request.
  const inquiryId = submission.inquiryId ?? randomUUID();

  // --- Artwork: every file on every design verified against Storage before any
  // of it is persisted. One design's bad file rejects the whole submission
  // rather than silently dropping that slot, so the customer is never told a
  // request landed with artwork it does not actually have.
  const verifiedDesigns: {
    design: DesignInput;
    designNumber: number;
    front: VerifiedArtwork | null;
    back: VerifiedArtwork | null;
  }[] = [];

  for (const [index, design] of submission.designs.entries()) {
    const designNumber = index + 1;
    let front: VerifiedArtwork | null = null;
    let back: VerifiedArtwork | null = null;

    if (!submission.artworkComingLater) {
      for (const side of ARTWORK_SIDES) {
        const file = side === "front" ? design.frontArtwork : design.backArtwork;
        if (!file) continue;
        const result = await verifyArtwork(
          supabase,
          inquiryId,
          design.id,
          designNumber,
          side,
          file,
        );
        if (!result.ok) return { error: result.error };
        if (side === "front") front = result.value;
        else back = result.value;
      }
    }
    verifiedDesigns.push({ design, designNumber, front, back });
  }

  const uploadedPaths = verifiedDesigns
    .flatMap(({ front, back }) => [front?.path, back?.path])
    .filter((path): path is string => Boolean(path));

  // --- Insert. The row id IS the artwork prefix, which also makes a duplicate
  // submit idempotent: a repeated click hits the primary key and we hand back
  // the reference that was already issued instead of creating a second row.
  const row = {
    id: inquiryId,
    bag_type: submission.bagType,
    quantity: submission.quantity,
    design_count: submission.designCount,
    artwork_coming_later: submission.artworkComingLater,
    // The legacy front_artwork_* / back_artwork_* columns are deliberately not
    // written. Migration 0024 backfilled them into mylar_designs /
    // mylar_artwork_files and left them in place for one release; writing both
    // would give an inquiry two sources of truth that drift the moment a
    // customer adds a second design. They are dropped in a later migration.
    customer_name: submission.customerName,
    customer_email: submission.customerEmail,
    customer_phone: submission.customerPhone || null,
    // Lead detail fields (migration 0025). Empty strings become null so "not
    // given" reads the same as it does on the inquiries filed before these
    // questions existed — the admin view renders both as "—".
    brand_name: submission.brandName || null,
    contact_method: submission.contactMethod,
    needed_by: submission.neededBy || null,
    notes: submission.notes || null,
    submitter_hash: hash,
  } as const;

  let referenceNumber = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateReferenceNumber();
    const { error } = await supabase
      .from("mylar_printing_inquiries")
      .insert({ ...row, reference_number: candidate });

    if (!error) {
      referenceNumber = candidate;
      break;
    }

    if (error.code === "23505") {
      // Reference collision (1 in ~10^9) — draw another and retry.
      if (error.message.includes("reference_number")) continue;

      // Primary-key collision means this exact submission already landed.
      const { data: existing } = await supabase
        .from("mylar_printing_inquiries")
        .select("reference_number")
        .eq("id", inquiryId)
        .maybeSingle();
      if (existing?.reference_number) {
        return { referenceNumber: existing.reference_number };
      }
    }

    console.error("submitMylarInquiryAction insert", error.code, error.message);
    await removeObjects(supabase, uploadedPaths);
    return {
      error:
        "We couldn't save your request. Please try again in a moment — nothing was charged or committed.",
    };
  }

  if (!referenceNumber) {
    await removeObjects(supabase, uploadedPaths);
    return { error: "We couldn't save your request. Please try again." };
  }

  // --- Designs + their artwork. Two child inserts rather than one nested
  // write, because PostgREST has no multi-table transaction: designs first (so
  // the artwork rows have a design_id to point at), then every file in one
  // batch.
  //
  // The design ids come from the client, which is safe and load-bearing: they
  // are the same uuids the artwork was uploaded under, and verifyArtwork has
  // already proved each object key sits under `{inquiryId}/{designId}/`. A
  // forged id therefore cannot claim anything — its files would not verify.
  const designRows = verifiedDesigns.map(({ design, designNumber }) => ({
    id: design.id,
    inquiry_id: inquiryId,
    design_number: designNumber,
    quantity: design.quantity,
  }));

  const { error: designError } = await supabase
    .from("mylar_designs")
    .insert(designRows);

  if (designError) {
    // A duplicate key here means this exact submission already landed (the
    // inquiry insert above is idempotent on the same primary key, so a retry
    // reaches this point with the designs already stored). Anything else is a
    // real failure, and the inquiry row it belongs to has to go with it —
    // an inquiry with no designs would show as an empty order to the studio.
    if (designError.code !== "23505") {
      console.error("mylar designs insert", designError.code, designError.message);
      await supabase.from("mylar_printing_inquiries").delete().eq("id", inquiryId);
      await removeObjects(supabase, uploadedPaths);
      return {
        error:
          "We couldn't save your designs. Please try again in a moment — nothing was charged or committed.",
      };
    }
  }

  const artworkRows = verifiedDesigns.flatMap(({ design, front, back }) =>
    ARTWORK_SIDES.flatMap((side) => {
      const file = side === "front" ? front : back;
      return file
        ? [
            {
              design_id: design.id,
              side,
              storage_path: file.path,
              file_name: file.name,
              file_size: file.size,
              mime_type: file.mimeType,
            },
          ]
        : [];
    }),
  );

  if (artworkRows.length > 0) {
    // `unique (design_id, side)` makes this idempotent on a retry, so a
    // duplicate-key error means the files are already recorded.
    const { error: artworkError } = await supabase
      .from("mylar_artwork_files")
      .insert(artworkRows);
    if (artworkError && artworkError.code !== "23505") {
      // The inquiry and its designs are stored and the objects exist; only the
      // artwork index failed. Losing the whole request over that would be worse
      // than filing it with the files unlinked, so this is logged loudly for
      // manual repair (the object keys carry the inquiry and design ids) and
      // the customer still gets their reference number.
      console.error(
        "mylar artwork files insert",
        artworkError.code,
        artworkError.message,
        uploadedPaths,
      );
    }
  }

  // --- Notification. Best effort: an email failure must never lose an inquiry
  // that is already safely stored, so it is logged and swallowed.
  await notifyStudio({ ...submission, inquiryId }, referenceNumber, verifiedDesigns);

  revalidatePath("/mylar-requests");
  return { referenceNumber };
}

async function notifyStudio(
  submission: {
    bagType: MylarBagType;
    quantity: number;
    designCount: number;
    artworkComingLater: boolean;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    brandName: string;
    contactMethod: MylarContactMethod;
    neededBy: string;
    notes: string;
    inquiryId: string;
  },
  referenceNumber: string,
  designs: {
    design: DesignInput;
    designNumber: number;
    front: VerifiedArtwork | null;
    back: VerifiedArtwork | null;
  }[],
) {
  const recipients = getAdminEmails();
  if (!isResendConfigured() || recipients.length === 0) return;

  // One line per design so the studio can see the split and which files belong
  // to which allocation without opening the dashboard. The email template takes
  // this as an opaque string, so no template change is needed.
  const allocation = designs
    .map(
      ({ design, designNumber }) =>
        `Design ${designNumber}: ${design.quantity.toLocaleString()} pcs`,
    )
    .join(" · ");

  const artworkSummary = submission.artworkComingLater
    ? `Customer is sending artwork later — ${allocation}`
    : designs
        .map(
          ({ designNumber, design, front, back }) =>
            `Design ${designNumber} (${design.quantity.toLocaleString()} pcs) — front: ${
              front ? front.name : "not provided"
            }, back: ${back ? back.name : "not provided"}`,
        )
        .join("\n");

  const email = mylarInquiryEmail({
    referenceNumber,
    bagType: bagTypeLabel(submission.bagType),
    quantity: submission.quantity,
    designCount: submission.designCount,
    customerName: submission.customerName,
    customerEmail: submission.customerEmail,
    customerPhone: submission.customerPhone || null,
    brandName: submission.brandName || null,
    // The label, not the raw value: this email is read by a person deciding how
    // to open the conversation.
    contactMethod: contactMethodLabel(submission.contactMethod),
    neededBy: submission.neededBy || null,
    artworkSummary,
    notes: submission.notes || null,
    adminUrl: `${getSiteUrl()}/mylar-requests/${submission.inquiryId}`,
  });

  try {
    const { error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to: recipients,
      replyTo: submission.customerEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) {
      console.error("mylar inquiry email", error.message);
    }
  } catch (err) {
    console.error("mylar inquiry email", err);
  }
}

/**
 * Drop an artwork object the customer removed or replaced before submitting.
 *
 * This is the cleanup half of the upload flow: without it, every "Remove" or
 * "Replace" would strand bytes in the bucket that no inquiry will ever
 * reference. Two guards make it safe to expose anonymously:
 *   - the key must sit under the caller's own inquiry-id prefix
 *     (`isOwnArtworkPath`), which is an unguessable uuid; and
 *   - an inquiry row with that id must not exist yet, so artwork attached to an
 *     already-submitted request can never be deleted this way.
 * NEVER BLOCKS THE CUSTOMER. The file is already gone from their draft either
 * way; a failure here only means an object lingers in a private bucket, which
 * is the studio's problem and not theirs. So the result is reported rather than
 * thrown — the caller logs it and, at most, mentions it once. What it must not
 * do is what it used to do: return void and let the caller assume success.
 *
 * `reason` is for our logs, not for the caller to render.
 */
export type DiscardArtworkResult = {
  ok: boolean;
  reason?: "not-configured" | "rejected" | "already-submitted" | "storage";
};

export async function discardMylarArtworkAction(input: {
  inquiryId: string;
  designId?: string;
  side: "front" | "back";
  path: string;
}): Promise<DiscardArtworkResult> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, reason: "not-configured" };
  }

  const { inquiryId, designId, side, path } = input;
  if (side !== "front" && side !== "back") return { ok: false, reason: "rejected" };
  if (!isOwnArtworkPath(path, inquiryId, side, designId)) {
    return { ok: false, reason: "rejected" };
  }

  try {
    const supabase = createAdminClient();
    const { data: submitted } = await supabase
      .from("mylar_printing_inquiries")
      .select("id")
      .eq("id", inquiryId)
      .maybeSingle();
    // Artwork on an inquiry that already landed is the studio's copy now.
    // Refusing is the correct outcome, so this is not a failure to report.
    if (submitted) return { ok: true, reason: "already-submitted" };

    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      console.error("discardMylarArtworkAction storage", path, error.message);
      return { ok: false, reason: "storage" };
    }
    return { ok: true };
  } catch (err) {
    console.error("discardMylarArtworkAction", err);
    return { ok: false, reason: "storage" };
  }
}
