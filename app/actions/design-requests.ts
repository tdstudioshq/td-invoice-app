"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";

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

// Upload pipeline for the PUBLIC /custom-design-request form. Formspree (the
// form's email backend) rejects file attachments on the free plan, so the
// browser uploads reference files to the private `design-requests` bucket
// (migration 0021) and the Formspree email carries signed download links.
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
  const failed: string[] = [];
  for (const path of paths) {
    const name = path.split("/").pop() ?? path;
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
  }

  return { links, failed };
}
