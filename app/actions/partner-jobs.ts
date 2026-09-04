"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getPartnerContext, partnerHomePath } from "@/lib/auth";
import { recordPartnerJobEvent } from "@/lib/partner-jobs/events";
import {
  deletePartnerJobSchema,
  discardPartnerUploadsSchema,
  mintPartnerUploadsSchema,
  partnerJobEditSchema,
  partnerJobSubmissionSchema,
  setPartnerJobDoneSchema,
  setPartnerJobStatusSchema,
} from "@/lib/partner-jobs/schema";
import {
  DESIGN_JOB_STATUS_LABEL,
  JOB_INCOMPLETE_STATUS,
  MAX_JOB_FILES,
  type DesignJobStatus,
} from "@/lib/partner-jobs/types";
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
 * Admin status writes live separately in app/actions/admin-partner-jobs.ts so a
 * partner bundle never references a service-role endpoint. Partner status
 * writes in this file always use the cookie-scoped client and remain RLS-bound.
 *
 * ACTIVITY EVENTS. Every write here ends with one recordPartnerJobEvent() call,
 * placed AFTER the write has committed and never inside a branch that can still
 * fail. That function is the only thing in this file that knows notifications
 * exist — it logs the event and hands the announcement to a dispatcher — so
 * there is exactly one notification seam per action and none at all in the
 * components. See lib/partner-jobs/events.ts.
 *
 * ONE EVENT PER USER ACTION, not per row touched. An edit that adds two files
 * and renames the job is one event whose metadata says so, not three; low-level
 * row churn is deliberately not the unit, or the studio's inbox becomes noise.
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

  // A file may only name a product that is actually in this submission. The
  // RPC re-checks this inside the transaction (it is the authoritative rule);
  // checking here first is what turns a rolled-back transaction into a
  // sentence the rep can act on.
  const itemIds = new Set(submission.items.map((item) => item.id));
  if (submission.files.some((file) => file.itemId && !itemIds.has(file.itemId))) {
    return { error: "A file is attached to a product that's no longer on this job. Reload and try again." };
  }

  // --- Files: verify each object against Storage before any of it is claimed.
  const verified: {
    item_id: string | null;
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
      item_id: file.itemId,
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
    // `item_number` is the rep's own ordering, stored rather than derived, so
    // "Item 2" keeps meaning the same product once a later edit adds or removes
    // one (the same reasoning as a mylar design's `design_number`).
    p_items: submission.items.map((item, index) => ({
      id: item.id,
      product_type: item.productType,
      finish: item.finish,
      quantity: item.quantity,
      notes: item.notes || null,
      item_number: index + 1,
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

  await recordPartnerJobEvent({
    jobId: created.job_id,
    jobNumber: created.job_number,
    jobName: submission.jobName,
    companyId: partner.companyId,
    companyName: partner.companyName,
    eventType: "job.created",
    actor: { kind: "partner" },
    actorDisplay: partner.displayName ?? partner.companyName,
    summary: `${submission.items.length} ${submission.items.length === 1 ? "product" : "products"}`,
    metadata: {
      products: submission.items.length,
      files: verified.length,
    },
  });

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


// ---------------------------------------------------------------------------
// Editing an existing job
// ---------------------------------------------------------------------------

export type EditPartnerJobResult =
  | { error: string; fieldErrors?: Record<string, string> }
  | { jobId: string; jobNumber: string };

/**
 * Save an edit: name, notes, the whole item set, plus files added and removed.
 *
 * Order matters and is deliberate. Everything that can be validated is
 * validated BEFORE anything is written, then the job and its items go through
 * the transactional `update_design_job` RPC, then the file index catches up.
 * If the RPC fails nothing has changed at all; file work only ever runs against
 * a job that has already saved cleanly.
 *
 * RLS is the authorization throughout — the cookie-scoped client cannot see, let
 * alone edit, another company's job, so this action carries no company check of
 * its own. What it DOES check is that every removed file actually belongs to
 * this job, since a file id is caller-supplied.
 *
 * `status` is untouchable here by construction: the RPC never writes it and a
 * database trigger forces it back for any caller with an auth.uid().
 */
export async function updatePartnerJobAction(
  input: unknown,
): Promise<EditPartnerJobResult> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };

  const partner = await getPartnerContext();
  if (!partner) return { error: NOT_A_PARTNER };

  const parsed = partnerJobEditSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Please check the highlighted details and try again.", fieldErrors };
  }
  const edit = parsed.data;
  const supabase = await createClient();

  // --- What is on this job right now. RLS scopes both reads, so they double as
  // proof that the caller may touch this job at all.
  const [
    { data: existing, error: existingError },
    { data: existingItems, error: itemsError },
  ] = await Promise.all([
    supabase
      .from("design_job_files")
      .select("id, storage_path, item_id")
      .eq("job_id", edit.jobId),
    supabase.from("design_job_items").select("id").eq("job_id", edit.jobId),
  ]);
  if (existingError || itemsError) {
    console.error(
      "updatePartnerJobAction load",
      existingError?.message ?? itemsError?.message,
    );
    return { error: "Couldn't load this job. Try again." };
  }
  const current = existing ?? [];

  // A removal must name a file that is actually on THIS job.
  const byId = new Map(current.map((f) => [f.id, f.storage_path]));
  const removePaths: string[] = [];
  for (const id of edit.removeFileIds) {
    const path = byId.get(id);
    if (!path) return { error: "One of those files is no longer on this job. Reload and try again." };
    removePaths.push(path);
  }

  // A file may only name a product that survives this edit — one being removed
  // is not somewhere to put artwork. The RPC enforces the same rule inside the
  // transaction; this is here to say so in a sentence.
  const keptItemIds = new Set(edit.items.map((item) => item.id));
  if (edit.addFiles.some((file) => file.itemId && !keptItemIds.has(file.itemId))) {
    return { error: "A file is attached to a product that's no longer on this job. Reload and try again." };
  }

  // --- Products the rep removed take their artwork with them: the file ROWS go
  // by the `on delete cascade` on design_job_files.item_id, but the storage
  // OBJECTS never do. Their keys are collected here, while the rows are still
  // readable, and deleted after the RPC — the same before/after split as
  // deletePartnerJobAction. Missing this is how a private bucket fills with
  // bytes nothing references.
  const droppedItemIds = (existingItems ?? [])
    .map((item) => item.id)
    .filter((id) => !keptItemIds.has(id));
  const cascadePaths = droppedItemIds.length
    ? current
        .filter((f) => f.item_id && droppedItemIds.includes(f.item_id))
        .map((f) => f.storage_path)
        // A file explicitly removed AND owned by a dropped product must not be
        // listed twice.
        .filter((path) => !removePaths.includes(path))
    : [];

  const remaining =
    current.length -
    removePaths.length -
    cascadePaths.length +
    edit.addFiles.length;
  if (remaining > MAX_JOB_FILES) {
    return { error: `A job can hold at most ${MAX_JOB_FILES} files.` };
  }

  // --- Verify every newly uploaded object before it is claimed, exactly as the
  // original submission does.
  const verified: {
    job_id: string;
    item_id: string | null;
    storage_path: string;
    original_filename: string;
    mime_type: string;
    file_size: number;
  }[] = [];

  for (const file of edit.addFiles) {
    if (!isOwnPartnerJobFilePath(file.path, partner.companyId, edit.jobId)) {
      return { error: "One of those files couldn't be verified. Remove it and try again." };
    }
    const ext = partnerExtensionOf(file.name);
    if (!isAllowedPartnerExtension(ext)) {
      return { error: `“${file.name}” isn't a file type we can use.` };
    }
    const { data: info, error } = await supabase.storage.from(BUCKET).info(file.path);
    if (error || !info) {
      return { error: `“${file.name}” didn't finish uploading. Attach it again.` };
    }
    const size = Number(info.size ?? 0);
    if (size <= 0) return { error: `“${file.name}” uploaded empty. Attach it again.` };
    if (size > MAX_PARTNER_UPLOAD_BYTES) return { error: `“${file.name}” is too large.` };
    verified.push({
      job_id: edit.jobId,
      item_id: file.itemId,
      storage_path: file.path,
      original_filename: file.name,
      mime_type: info.contentType || resolvePartnerContentType(file.name, null),
      file_size: size,
    });
  }

  // --- Job + items, atomically.
  const { data, error } = await supabase.rpc("update_design_job", {
    p_job_id: edit.jobId,
    p_job_name: edit.jobName,
    p_notes: edit.notes || null,
    // Item ids ride along so the RPC can reconcile the set instead of replacing
    // it — replacing would cascade every per-product file away on a rename.
    p_items: edit.items.map((item, index) => ({
      id: item.id,
      product_type: item.productType,
      finish: item.finish,
      quantity: item.quantity,
      notes: item.notes || null,
      item_number: index + 1,
    })),
  });
  if (error) {
    console.error("updatePartnerJobAction rpc", error.code, error.message);
    return { error: "We couldn't save those changes. Nothing was modified — try again." };
  }
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved?.job_id) return { error: "We couldn't save those changes. Try again." };

  // --- File index. The job itself is already saved, so a failure here is
  // reported plainly rather than pretending the whole edit failed.
  if (verified.length > 0) {
    const { error: addError } = await supabase.from("design_job_files").insert(verified);
    if (addError) {
      console.error("updatePartnerJobAction add files", addError.message);
      return { error: "Your changes saved, but the new files didn't attach. Try adding them again." };
    }
  }
  if (edit.removeFileIds.length > 0) {
    const { error: delError } = await supabase
      .from("design_job_files")
      .delete()
      .in("id", edit.removeFileIds);
    if (delError) {
      console.error("updatePartnerJobAction remove files", delError.message);
      return { error: "Your changes saved, but a file couldn't be removed. Try again." };
    }
  }
  // Drop the bytes too — a row-only delete would leave the object stranded in a
  // private bucket with nothing referencing it. RLS on storage.objects pins this
  // to the caller's own company prefix.
  //
  // Two sources, one call: files the rep removed by hand, and files whose
  // product they removed (those ROWS are already gone, taken by the cascade
  // inside the RPC above — only their objects are left).
  const orphanedPaths = [...removePaths, ...cascadePaths];
  if (orphanedPaths.length > 0) {
    const { error: objError } = await supabase.storage.from(BUCKET).remove(orphanedPaths);
    if (objError) console.error("updatePartnerJobAction storage remove", objError.message);
  }

  // One event for the whole save, typed by what dominated it. Artwork moving is
  // what the studio most needs to hear about, so it wins over a rename; the
  // metadata carries everything either way, so nothing is lost by not emitting
  // three events for one click.
  const filesAdded = verified.length;
  const filesRemoved = removePaths.length + cascadePaths.length;
  const eventType =
    filesAdded > 0 ? "file.added" : filesRemoved > 0 ? "file.removed" : "job.updated";
  const changes = [
    filesAdded > 0 ? `${filesAdded} added` : null,
    filesRemoved > 0 ? `${filesRemoved} removed` : null,
  ].filter(Boolean);

  await recordPartnerJobEvent({
    jobId: edit.jobId,
    jobNumber: saved.job_number,
    jobName: edit.jobName,
    companyId: partner.companyId,
    companyName: partner.companyName,
    eventType,
    actor: { kind: "partner" },
    actorDisplay: partner.displayName ?? partner.companyName,
    summary:
      changes.length > 0
        ? `artwork ${changes.join(", ")}`
        : "products and details saved",
    metadata: {
      filesAdded,
      filesRemoved,
      products: edit.items.length,
    },
  });

  revalidatePath(partnerHomePath(partner.companySlug));
  revalidatePath(`${partnerHomePath(partner.companySlug)}/${edit.jobId}`);
  revalidatePath("/partner-jobs");
  revalidatePath(`/partner-jobs/${edit.jobId}`);
  return { jobId: saved.job_id, jobNumber: saved.job_number };
}

/**
 * Delete a job outright, with its products and its artwork.
 *
 * The item and file ROWS go by cascade; the storage objects do not, so their
 * keys are collected first and removed after. Both the row delete and the object
 * delete are RLS-scoped to the caller's own company.
 */
export async function deletePartnerJobAction(
  input: unknown,
): Promise<{ error: string } | { deleted: true }> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };

  const partner = await getPartnerContext();
  if (!partner) return { error: NOT_A_PARTNER };

  const parsed = deletePartnerJobSchema.safeParse(input);
  if (!parsed.success) return { error: "That job couldn't be found." };
  const { jobId } = parsed.data;

  const supabase = await createClient();
  // Collect the object keys while the rows are still readable.
  const { data: files } = await supabase
    .from("design_job_files")
    .select("storage_path")
    .eq("job_id", jobId);
  const paths = (files ?? []).map((f) => f.storage_path);

  // Selected on the way out because the event has to name a job that no longer
  // exists — partner_job_events denormalizes number and name for exactly this.
  const { data: deleted, error } = await supabase
    .from("design_jobs")
    .delete()
    .eq("id", jobId)
    .select("id, job_number, job_name");
  if (error) {
    console.error("deletePartnerJobAction", error.message);
    return { error: "We couldn't delete that job. Try again." };
  }
  // RLS returns no rows rather than an error when the job isn't the caller's.
  if (!deleted || deleted.length === 0) {
    return { error: "That job couldn't be found." };
  }

  if (paths.length > 0) {
    const { error: objError } = await supabase.storage.from(BUCKET).remove(paths);
    if (objError) console.error("deletePartnerJobAction storage", objError.message);
  }

  await recordPartnerJobEvent({
    // The row is gone, so the FK cannot point at it. The number and name below
    // are what the event and the notification are built from.
    jobId: null,
    jobNumber: deleted[0].job_number,
    jobName: deleted[0].job_name,
    companyId: partner.companyId,
    companyName: partner.companyName,
    eventType: "job.deleted",
    actor: { kind: "partner" },
    actorDisplay: partner.displayName ?? partner.companyName,
    metadata: { filesRemoved: paths.length },
  });

  revalidatePath(partnerHomePath(partner.companySlug));
  revalidatePath("/partner-jobs");
  return { deleted: true };
}

/**
 * Set any of the three lifecycle states from the partner jobs dropdown.
 *
 * Cookie-scoped like every other partner write: design_jobs_partner_update
 * limits the UPDATE to the caller's own company, and migration
 * 20260831113855 keeps the identity/ownership columns immutable while allowing
 * this one checked field to move. A foreign job id therefore returns no row,
 * not a useful clue about another company's data.
 */
export async function setPartnerJobStatusAction(
  input: unknown,
): Promise<{ error: string } | { status: DesignJobStatus }> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };

  const partner = await getPartnerContext();
  if (!partner) return { error: NOT_A_PARTNER };

  const parsed = setPartnerJobStatusSchema.safeParse(input);
  if (!parsed.success) return { error: "That job couldn't be found." };
  const { jobId, status } = parsed.data;

  const supabase = await createClient();
  const { data: before, error: readError } = await supabase
    .from("design_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();
  if (readError) {
    console.error("setPartnerJobStatusAction read", readError.message);
    return { error: "We couldn't update that job. Try again." };
  }
  if (!before) return { error: "That job couldn't be found." };
  if (before.status === status) return { status };

  const { data: updated, error } = await supabase
    .from("design_jobs")
    .update({ status })
    .eq("id", jobId)
    .select("id, status, job_number, job_name")
    .maybeSingle();
  if (error) {
    console.error("setPartnerJobStatusAction", error.message);
    return { error: "We couldn't update that job. Try again." };
  }
  // RLS returns no rows rather than an error when the job isn't the caller's.
  if (!updated) {
    return { error: "That job couldn't be found." };
  }
  // This catches an unapplied/stale protection trigger explicitly instead of
  // showing a successful dropdown choice that Postgres silently reverted.
  if (updated.status !== status) {
    return { error: "That status change wasn't accepted. Refresh and try again." };
  }

  await recordPartnerJobEvent({
    jobId,
    jobNumber: updated.job_number,
    jobName: updated.job_name,
    companyId: partner.companyId,
    companyName: partner.companyName,
    eventType: "job.status_changed",
    actor: { kind: "partner" },
    actorDisplay: partner.displayName ?? partner.companyName,
    summary: `${DESIGN_JOB_STATUS_LABEL[before.status]} → ${DESIGN_JOB_STATUS_LABEL[status]}`,
    metadata: { from: before.status, to: status },
  });

  revalidatePath(partnerHomePath(partner.companySlug));
  revalidatePath(`${partnerHomePath(partner.companySlug)}/${jobId}`);
  revalidatePath("/partner-jobs");
  revalidatePath(`/partner-jobs/${jobId}`);
  return { status };
}

/**
 * The existing quick Done checkbox is a two-state shortcut over the same write
 * path as the dropdown. Un-ticking still lands on In Progress, never New.
 */
export async function setPartnerJobDoneAction(
  input: unknown,
): Promise<{ error: string } | { done: boolean }> {
  const parsed = setPartnerJobDoneSchema.safeParse(input);
  if (!parsed.success) return { error: "That job couldn't be found." };

  const result = await setPartnerJobStatusAction({
    jobId: parsed.data.jobId,
    status: parsed.data.done ? "completed" : JOB_INCOMPLETE_STATUS,
  });
  if ("error" in result) return result;
  return { done: result.status === "completed" };
}
