"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getPartnerContext, partnerHomePath } from "@/lib/auth";
import {
  discardPartnerUploadsSchema,
  mintPartnerUploadsSchema,
  partnerJobSubmissionSchema,
} from "@/lib/partner-jobs/schema";
import {
  MAX_PARTNER_UPLOAD_BYTES,
  buildPartnerJobFilePath,
  isAllowedPartnerExtension,
  isOwnPartnerJobFilePath,
  partnerExtensionOf,
  resolvePartnerContentType,
  validatePartnerUploadFile,
} from "@/lib/partner-jobs/uploads";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Partner-side writes for the print-partner job portal.
 *
 * TRUST BOUNDARY. Unlike the public mylar/design-request intakes there IS a
 * session here, so this file leans on it rather than on anti-spam heuristics:
 * every export begins with `getPartnerContext()`, and every database write goes
 * through the COOKIE-SCOPED client so Postgres RLS re-checks the same company
 * boundary independently. A bug in this file cannot leak another company's data
 * — it would have to get past the policies in migration 20260825120000 too.
 *
 * The service-role client appears exactly once, in `discardPartnerJobFilesAction`,
 * because partners deliberately have no DELETE policy on `storage.objects` (a
 * filed job's files are a record). That use is narrowed the same way
 * `discardMylarArtworkAction` is: the path must sit under the caller's own
 * `{companyId}/{jobId}/` prefix, and the job must not exist yet.
 *
 * Admin-only writes (status changes) live in app/actions/admin-partner-jobs.ts
 * so the partner bundle never references an admin endpoint — the same split as
 * mylar-printing / mylar-requests.
 */

const BUCKET = "partner-job-files";

const NOT_A_PARTNER =
  "Your account doesn't have access to this partner portal.";
const NOT_CONFIGURED = "Ordering isn't available right now. Please try again shortly.";

export interface PartnerUploadTicket {
  name: string;
  ok: true;
  path: string;
  signedUrl: string;
  token: string;
  contentType: string;
}

export interface PartnerUploadRejection {
  name: string;
  ok: false;
  error: string;
}

export type MintPartnerUploadsResult =
  | { error: string }
  | { jobId: string; tickets: (PartnerUploadTicket | PartnerUploadRejection)[] };

/**
 * Mint one signed upload URL per file. The browser PUTs bytes straight to
 * Storage with them, so file bytes never pass through a Server Action (Next
 * caps those at ~4 MB here) — which is what makes the 50 MB ceiling possible.
 *
 * The FIRST call passes `jobId: null` and gets a fresh uuid back; the form
 * reuses it for every later file and for the submission itself, so the object
 * keys and the eventual `design_jobs` row all share one identifier.
 *
 * Per-file validation failures ride back as per-file rejections — one bad file
 * never fails the batch, matching `createUploadTicketsAction`.
 */
export async function createPartnerJobUploadTicketsAction(input: {
  jobId: string | null;
  files: { name: string; size: number; type: string | null }[];
}): Promise<MintPartnerUploadsResult> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };

  const partner = await getPartnerContext();
  if (!partner) return { error: NOT_A_PARTNER };

  const parsed = mintPartnerUploadsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid upload request." };
  }

  // A caller-supplied job id is a uuid the schema already validated, and it only
  // ever scopes them to their own folder: the storage policy pins the FIRST path
  // segment to their company, and the submission re-derives the same prefix. It
  // cannot be used to reach another job's files.
  const jobId = parsed.data.jobId ?? randomUUID();
  const supabase = await createClient();

  const tickets: (PartnerUploadTicket | PartnerUploadRejection)[] = [];
  for (const file of parsed.data.files) {
    const invalid = validatePartnerUploadFile(file.name, file.size, file.type);
    if (invalid) {
      tickets.push({ name: file.name, ok: false, error: invalid });
      continue;
    }
    const path = buildPartnerJobFilePath(
      partner.companyId,
      jobId,
      randomUUID(),
      file.name,
    );
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error("createPartnerJobUploadTicketsAction", error?.message);
      tickets.push({
        name: file.name,
        ok: false,
        error: "Couldn't start that upload. Try again.",
      });
      continue;
    }
    tickets.push({
      name: file.name,
      ok: true,
      path: data.path,
      signedUrl: data.signedUrl,
      token: data.token,
      contentType: resolvePartnerContentType(file.name, file.type),
    });
  }

  return { jobId, tickets };
}

export type SubmitPartnerJobResult =
  | { error: string; fieldErrors?: Record<string, string> }
  | { jobId: string; jobNumber: string };

/**
 * File a job: the row, its products and its file index, in ONE transaction.
 *
 * The three inserts go through the `create_design_job` RPC rather than three
 * PostgREST calls precisely so a failure cannot strand half a submission — the
 * function is SECURITY INVOKER, so the caller's own RLS still authorizes every
 * statement inside it, and a rollback leaves nothing behind but the Storage
 * objects (which the caller then discards).
 *
 * Order of checks: partner session -> zod -> every claimed file proved to live
 * under this caller's own `{companyId}/{jobId}/` prefix -> size and MIME read
 * back from `storage.info()` (the browser's numbers are never trusted) -> the
 * transactional insert.
 */
export async function submitPartnerJobAction(
  input: unknown,
): Promise<SubmitPartnerJobResult> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };

  const partner = await getPartnerContext();
  if (!partner) return { error: NOT_A_PARTNER };

  const parsed = partnerJobSubmissionSchema.safeParse(input);
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

  // Files are uploaded under `{companyId}/{jobId}/`, so a submission that claims
  // files MUST carry the id they were minted against. A null id here can only
  // mean the two halves came from different flows.
  if (submission.files.length > 0 && !submission.jobId) {
    return { error: "Those files couldn't be matched to this job. Attach them again." };
  }
  const jobId = submission.jobId ?? randomUUID();
  const supabase = await createClient();

  // --- Files: verify each object against Storage before any of it is claimed.
  const verified: {
    storage_path: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
  }[] = [];

  for (const file of submission.files) {
    // A path outside this caller's own company+job prefix is never touched.
    if (
      !isOwnPartnerJobFilePath(file.path, partner.companyId, jobId)
    ) {
      return { error: "One of those files couldn't be verified. Remove it and try again." };
    }
    const ext = partnerExtensionOf(file.name);
    if (!isAllowedPartnerExtension(ext)) {
      return { error: `“${file.name}” isn't a file type we can use.` };
    }

    const { data: info, error } = await supabase.storage
      .from(BUCKET)
      .info(file.path);
    if (error || !info) {
      return {
        error: `“${file.name}” didn't finish uploading. Remove it and attach it again.`,
      };
    }
    // Authoritative values — what the browser reported is only ever a hint.
    const size = Number(info.size ?? 0);
    if (size <= 0) {
      return { error: `“${file.name}” uploaded empty. Attach it again.` };
    }
    if (size > MAX_PARTNER_UPLOAD_BYTES) {
      return { error: `“${file.name}” is too large.` };
    }

    verified.push({
      storage_path: file.path,
      original_filename: file.name,
      mime_type: info.contentType || resolvePartnerContentType(file.name, null),
      file_size: size,
    });
  }

  // --- The whole submission, atomically, under the caller's own RLS.
  const { data, error } = await supabase.rpc("create_design_job", {
    p_job_id: jobId,
    p_job_name: submission.jobName,
    p_notes: submission.notes || null,
    p_items: submission.items.map((item) => ({
      product_type: item.productType,
      finish: item.finish,
      quantity: item.quantity,
    })),
    p_files: verified,
  });

  if (error) {
    // A primary-key collision means this exact submission already landed — a
    // double-click, or a retry after a response was lost. Hand back the job
    // that exists rather than filing a second one. RLS scopes the lookup, so
    // this can only ever resolve to the caller's own job.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("design_jobs")
        .select("id, job_number")
        .eq("id", jobId)
        .maybeSingle();
      if (existing) {
        return { jobId: existing.id, jobNumber: existing.job_number };
      }
    }
    console.error("submitPartnerJobAction", error.code, error.message);
    return {
      error:
        "We couldn't file that job. Nothing was saved — please try again in a moment.",
    };
  }

  const created = Array.isArray(data) ? data[0] : data;
  if (!created?.job_id) {
    console.error("submitPartnerJobAction: RPC returned no job");
    return { error: "We couldn't file that job. Please try again." };
  }

  revalidatePath(partnerHomePath(partner.companySlug));
  revalidatePath("/partner-jobs");
  return { jobId: created.job_id, jobNumber: created.job_number };
}

export type DiscardPartnerUploadsResult = { ok: boolean };

/**
 * Drop objects uploaded for a submission that never landed.
 *
 * Called when the transactional insert above fails, so bytes are not left in a
 * private bucket that nothing will ever reference. The one place the
 * service-role client is used on the partner side, because reps have no DELETE
 * policy on `storage.objects` by design — with two guards that make it safe:
 *
 *   * every path must sit under the caller's OWN `{companyId}/{jobId}/` prefix,
 *     both segments proven against their live session, so this can never reach
 *     another company's files; and
 *   * the job must not exist yet, so files belonging to an already-filed job
 *     can never be deleted this way.
 *
 * Never blocks the rep: the files are gone from their draft either way, and a
 * failure here only means an object lingers. Reported rather than thrown, so
 * the caller can log it instead of assuming success.
 */
export async function discardPartnerJobFilesAction(input: {
  jobId: string;
  paths: string[];
}): Promise<DiscardPartnerUploadsResult> {
  const partner = await getPartnerContext();
  if (!partner) return { ok: false };

  const parsed = discardPartnerUploadsSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { jobId, paths } = parsed.data;

  const owned = paths.filter((path) =>
    isOwnPartnerJobFilePath(path, partner.companyId, jobId),
  );
  if (owned.length !== paths.length) return { ok: false };
  if (!isSupabaseAdminConfigured()) return { ok: false };

  try {
    const supabase = createAdminClient();
    const { data: filed } = await supabase
      .from("design_jobs")
      .select("id")
      .eq("id", jobId)
      .maybeSingle();
    // Files on a job that already landed are the studio's copy now. Refusing is
    // the correct outcome, so this is not reported as a failure.
    if (filed) return { ok: true };

    const { error } = await supabase.storage.from(BUCKET).remove(owned);
    if (error) {
      console.error("discardPartnerJobFilesAction", error.message);
      return { ok: false };
    }
    return { ok: true };
  } catch (error) {
    console.error("discardPartnerJobFilesAction", error);
    return { ok: false };
  }
}
