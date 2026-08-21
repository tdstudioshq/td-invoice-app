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
} from "@/lib/mylar-printing/schema";
import { bagTypeLabel, type MylarBagType } from "@/lib/mylar-printing/types";
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
  const { side, name, size, type } = parsed.data;

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
  const path = buildArtworkPath(inquiryId, side, randomUUID(), name);

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
  side: "front" | "back",
  file: ArtworkFileInput,
): Promise<{ ok: true; value: VerifiedArtwork } | { ok: false; error: string }> {
  const label = side === "front" ? "Front" : "Back";

  // A path outside this inquiry's own prefix is never touched — not read, not
  // removed. It may well belong to somebody else's request.
  if (!isOwnArtworkPath(file.path, inquiryId, side)) {
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
    console.error("mylar artwork cleanup failed", paths, err);
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

  // --- Artwork: verified against Storage before any of it is persisted.
  let front: VerifiedArtwork | null = null;
  let back: VerifiedArtwork | null = null;
  if (!submission.artworkComingLater) {
    if (submission.frontArtwork) {
      const result = await verifyArtwork(
        supabase,
        inquiryId,
        "front",
        submission.frontArtwork,
      );
      if (!result.ok) return { error: result.error };
      front = result.value;
    }
    if (submission.backArtwork) {
      const result = await verifyArtwork(
        supabase,
        inquiryId,
        "back",
        submission.backArtwork,
      );
      if (!result.ok) return { error: result.error };
      back = result.value;
    }
  }
  const uploadedPaths = [front?.path, back?.path].filter(
    (path): path is string => Boolean(path),
  );

  // --- Insert. The row id IS the artwork prefix, which also makes a duplicate
  // submit idempotent: a repeated click hits the primary key and we hand back
  // the reference that was already issued instead of creating a second row.
  const row = {
    id: inquiryId,
    bag_type: submission.bagType,
    quantity: submission.quantity,
    design_count: submission.designCount,
    artwork_coming_later: submission.artworkComingLater,
    front_artwork_path: front?.path ?? null,
    front_artwork_name: front?.name ?? null,
    front_artwork_size: front?.size ?? null,
    front_artwork_mime_type: front?.mimeType ?? null,
    back_artwork_path: back?.path ?? null,
    back_artwork_name: back?.name ?? null,
    back_artwork_size: back?.size ?? null,
    back_artwork_mime_type: back?.mimeType ?? null,
    customer_name: submission.customerName,
    customer_email: submission.customerEmail,
    customer_phone: submission.customerPhone || null,
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

  // --- Notification. Best effort: an email failure must never lose an inquiry
  // that is already safely stored, so it is logged and swallowed.
  await notifyStudio(
    { ...submission, inquiryId },
    referenceNumber,
    front,
    back,
  );

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
    notes: string;
    inquiryId: string;
  },
  referenceNumber: string,
  front: VerifiedArtwork | null,
  back: VerifiedArtwork | null,
) {
  const recipients = getAdminEmails();
  if (!isResendConfigured() || recipients.length === 0) return;

  const artworkSummary = submission.artworkComingLater
    ? "Customer is sending artwork later"
    : [
        front ? `Front: ${front.name}` : "Front: not provided",
        back ? `Back: ${back.name}` : "Back: not provided",
      ].join(" · ");

  const email = mylarInquiryEmail({
    referenceNumber,
    bagType: bagTypeLabel(submission.bagType),
    quantity: submission.quantity,
    designCount: submission.designCount,
    customerName: submission.customerName,
    customerEmail: submission.customerEmail,
    customerPhone: submission.customerPhone || null,
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
 * Best effort by design — a failure is logged, not surfaced. The customer has
 * already moved on, and a stray object is harmless.
 */
export async function discardMylarArtworkAction(input: {
  inquiryId: string;
  side: "front" | "back";
  path: string;
}): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;

  const { inquiryId, side, path } = input;
  if (side !== "front" && side !== "back") return;
  if (!isOwnArtworkPath(path, inquiryId, side)) return;

  try {
    const supabase = createAdminClient();
    const { data: submitted } = await supabase
      .from("mylar_printing_inquiries")
      .select("id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (submitted) return;

    await supabase.storage.from(BUCKET).remove([path]);
  } catch (err) {
    console.error("discardMylarArtworkAction", err);
  }
}
