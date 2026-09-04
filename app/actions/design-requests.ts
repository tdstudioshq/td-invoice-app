"use server";

import { randomInt, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  MIN_FILL_MS,
  SUBMIT_WINDOW_MAX,
  SUBMIT_WINDOW_MS,
  checkBurst,
  submitterHash,
} from "@/lib/mylar-printing/abuse";
import { customDesignRequestSubmissionSchema } from "@/lib/design-requests/schema";
import { getAdminEmails } from "@/lib/auth";
import { reportError, summarizePaths } from "@/lib/observability/report-error";
import {
  EMAIL_FROM,
  getResend,
  getSiteUrl,
  isResendConfigured,
} from "@/lib/email/client";
import { customDesignRequestEmail } from "@/lib/email/templates";
import { sanitizeFileName } from "@/lib/portal";
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  extensionOf,
  resolveUploadContentType,
  validateUploadFile,
} from "@/lib/uploads";
import {
  createAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

// Upload pipeline for the PUBLIC /custom-design-request form. The browser
// uploads reference files to the private `design-requests` bucket and the
// final server action records their verified paths in Supabase.
//
// These actions are deliberately anonymous — the form has no auth — so the
// service-role client does the storage work. The trust boundary mirrors
// app/actions/uploads.ts:
//   1. mintDesignRequestUploadsAction validates name/size/type and only mints
//      signed upload URLs for server-built paths under a fresh request uuid.
//   2. The bucket's file_size_limit (25 MB) caps the actual bytes.
//   3. finalizeDesignRequestUploadsAction verifies each object via
//      storage.info() before minting a download link, and removes anything
//      invalid so no orphan survives.
// Abuse ceiling: an anonymous caller can fill at most MAX_REQUEST_FILES × 25 MB
// per minted request into a private bucket nobody can read back without the
// per-object signed URL. Acceptable for a low-traffic request form.

const BUCKET = "design-requests";

// Tighter than the admin batch cap — this is a reference-files field, not a
// delivery pipeline.
const MAX_REQUEST_FILES = 10;

// How long the links in the request email stay valid.
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type DesignRequestTicket =
  | {
      name: string;
      ok: true;
      path: string;
      token: string;
      signedUrl: string;
      contentType: string;
    }
  | { name: string; ok: false; error: string };

const mintInputSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        size: z.number().int().positive(),
        type: z.string().nullable(),
      }),
    )
    .min(1)
    .max(MAX_REQUEST_FILES, `At most ${MAX_REQUEST_FILES} files per request.`),
});

export async function mintDesignRequestUploadsAction(input: {
  files: { name: string; size: number; type: string | null }[];
}): Promise<{ error?: string; requestId?: string; tickets?: DesignRequestTicket[] }> {
  if (!isSupabaseAdminConfigured()) {
    return { error: "File uploads are not available right now." };
  }

  const parsed = mintInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid upload request.",
    };
  }

  const supabase = createAdminClient();
  const requestId = randomUUID();

  const tickets: DesignRequestTicket[] = [];
  for (const file of parsed.data.files) {
    const invalid = validateUploadFile(file.name, file.size, file.type);
    if (invalid) {
      tickets.push({ name: file.name, ok: false, error: invalid });
      continue;
    }
    const path = `${requestId}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      tickets.push({
        name: file.name,
        ok: false,
        error: error?.message ?? "Could not create an upload URL.",
      });
      continue;
    }
    tickets.push({
      name: file.name,
      ok: true,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
      contentType: resolveUploadContentType(file.name, file.type),
    });
  }

  return { requestId, tickets };
}

const finalizeInputSchema = z.object({
  requestId: z.string().uuid(),
  paths: z.array(z.string().min(1).max(500)).min(1).max(MAX_REQUEST_FILES),
});

/**
 * Verify the uploaded objects exist and mint one 30-day signed download URL
 * per file, for inclusion in the request email. Objects that fail
 * verification are removed and reported per-file.
 */
export async function finalizeDesignRequestUploadsAction(input: {
  requestId: string;
  paths: string[];
}): Promise<{
  error?: string;
  links?: { name: string; url: string }[];
  files?: {
    path: string;
    name: string;
    size: number;
    mimeType: string;
  }[];
  failed?: string[];
}> {
  if (!isSupabaseAdminConfigured()) {
    return { error: "File uploads are not available right now." };
  }

  const parsed = finalizeInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { requestId, paths } = parsed.data;

  const supabase = createAdminClient();
  // requestId is a validated uuid, so this pattern is built from trusted parts.
  const pathPattern = new RegExp(`^${requestId}/\\d+-[\\w.\\-]{1,200}$`);

  const links: { name: string; url: string }[] = [];
  const files: {
    path: string;
    name: string;
    size: number;
    mimeType: string;
  }[] = [];
  const failed: string[] = [];
  for (const path of paths) {
    const storedName = path.split("/").pop() ?? path;
    const name = storedName.replace(/^\d+-/, "");
    const remove = () =>
      supabase.storage
        .from(BUCKET)
        .remove([path])
        .then(() => undefined);

    const ext = extensionOf(path);
    if (
      !pathPattern.test(path) ||
      !(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)
    ) {
      await remove();
      failed.push(name);
      continue;
    }

    const { data: info, error: infoError } = await supabase.storage
      .from(BUCKET)
      .info(path);
    if (infoError || !info || (info.size ?? 0) <= 0) {
      await remove();
      failed.push(name);
      continue;
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, DOWNLOAD_URL_TTL_SECONDS, { download: name });
    if (signError || !signed) {
      failed.push(name);
      continue;
    }
    links.push({ name, url: signed.signedUrl });
    files.push({
      path,
      name,
      size: Number(info.size),
      mimeType: info.contentType || resolveUploadContentType(name, null),
    });
  }

  return { links, files, failed };
}

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SUBMIT_BURST_MAX = 5;
const GENERIC_REJECTION =
  "We couldn't process that request. Please try again, or text us directly.";

function generateReferenceNumber(): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `DES-${out}`;
}

type VerifiedAsset = {
  path: string;
  name: string;
  size: number;
  mimeType: string;
};

async function removeDesignObjects(
  supabase: ReturnType<typeof createAdminClient>,
  paths: string[],
) {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(BUCKET).remove(paths);
  } catch (error) {
    // Object keys embed the customer's own filename, so log the shape of the
    // batch rather than the batch itself.
    reportError("design-request asset cleanup", error, summarizePaths(paths));
  }
}

export type SubmitCustomDesignRequestResult =
  | { error: string }
  | { referenceNumber: string };

/**
 * Store a public custom-design request in Supabase. The service role is kept
 * entirely server-side; RLS has no browser policies for either intake table.
 */
export async function submitCustomDesignRequestAction(
  input: unknown,
): Promise<SubmitCustomDesignRequestResult> {
  if (!isSupabaseAdminConfigured()) {
    return { error: "Requests aren't being accepted right now. Please text us directly." };
  }

  const parsed = customDesignRequestSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please check your details and try again." };
  }
  const submission = parsed.data;

  if (submission.website.trim().length > 0) return { error: GENERIC_REJECTION };
  const elapsed = Date.now() - submission.startedAt;
  if (elapsed >= 0 && elapsed < MIN_FILL_MS) return { error: GENERIC_REJECTION };

  const hash = await submitterHash();
  if (
    hash &&
    !checkBurst(`design:submit:${hash}`, SUBMIT_BURST_MAX, SUBMIT_WINDOW_MS)
  ) {
    return { error: "You've sent a few requests already. Please wait a few minutes." };
  }

  const supabase = createAdminClient();
  if (hash) {
    const since = new Date(Date.now() - SUBMIT_WINDOW_MS).toISOString();
    const { count, error } = await supabase
      .from("custom_design_requests")
      .select("id", { count: "exact", head: true })
      .eq("submitter_hash", hash)
      .gte("created_at", since);
    if (!error && (count ?? 0) >= SUBMIT_WINDOW_MAX) {
      return { error: "You've sent a few requests already. Please wait a few minutes." };
    }
  }

  const requestId = submission.requestId ?? randomUUID();
  const pathPattern = new RegExp(`^${requestId}/\\d+-[\\w.\\-]{1,200}$`);
  const verifiedAssets: VerifiedAsset[] = [];

  for (const asset of submission.assets) {
    if (!pathPattern.test(asset.path)) return { error: GENERIC_REJECTION };
    const { data: info, error } = await supabase.storage
      .from(BUCKET)
      .info(asset.path);
    if (error || !info) {
      return { error: `${asset.name} did not finish uploading. Please upload it again.` };
    }
    const name = (asset.path.split("/").pop() ?? asset.name).replace(/^\d+-/, "");
    const size = Number(info.size ?? 0);
    const mimeType = info.contentType || resolveUploadContentType(name, null);
    const invalid = validateUploadFile(name, size, mimeType);
    if (invalid) return { error: `${name}: ${invalid}` };
    verifiedAssets.push({ path: asset.path, name, size, mimeType });
  }

  const row = {
    id: requestId,
    reference_number: "",
    customer_name: submission.customerName,
    customer_email: submission.customerEmail,
    customer_phone: submission.customerPhone,
    instagram_username: submission.instagramUsername,
    design_type: submission.designType,
    notes: submission.notes,
    submitter_hash: hash,
  };

  let referenceNumber = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateReferenceNumber();
    const { error } = await supabase
      .from("custom_design_requests")
      .insert({ ...row, reference_number: candidate });
    if (!error) {
      referenceNumber = candidate;
      break;
    }
    if (error.code === "23505" && error.message.includes("reference_number")) {
      continue;
    }
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("custom_design_requests")
        .select("reference_number")
        .eq("id", requestId)
        .maybeSingle();
      if (existing) return { referenceNumber: existing.reference_number };
    }
    console.error("custom design request insert", error.code, error.message);
    await removeDesignObjects(
      supabase,
      verifiedAssets.map((asset) => asset.path),
    );
    return { error: "We couldn't save your request. Please try again." };
  }

  if (!referenceNumber) {
    await removeDesignObjects(
      supabase,
      verifiedAssets.map((asset) => asset.path),
    );
    return { error: "We couldn't create a reference number. Please try again." };
  }

  if (verifiedAssets.length > 0) {
    const { error } = await supabase.from("custom_design_request_files").insert(
      verifiedAssets.map((asset) => ({
        request_id: requestId,
        storage_path: asset.path,
        file_name: asset.name,
        file_size: asset.size,
        mime_type: asset.mimeType,
      })),
    );
    if (error) {
      console.error("custom design files insert", error.code, error.message);
      await supabase.from("custom_design_requests").delete().eq("id", requestId);
      await removeDesignObjects(
        supabase,
        verifiedAssets.map((asset) => asset.path),
      );
      return { error: "We couldn't save your uploaded files. Please try again." };
    }
  }

  if (isResendConfigured()) {
    const recipients = getAdminEmails();
    if (recipients.length > 0) {
      const email = customDesignRequestEmail({
        referenceNumber,
        customerName: submission.customerName,
        customerEmail: submission.customerEmail,
        customerPhone: submission.customerPhone,
        instagramUsername: submission.instagramUsername,
        designType: submission.designType,
        notes: submission.notes,
        assetCount: verifiedAssets.length,
        adminUrl: `${getSiteUrl()}/design-requests/${requestId}`,
      });
      try {
        await getResend().emails.send({ from: EMAIL_FROM, to: recipients, ...email });
      } catch (error) {
        console.error("custom design notification", error);
      }
    }
  }

  revalidatePath("/design-requests");
  return { referenceNumber };
}
