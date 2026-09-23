"use server";

/**
 * Partner-job EDIT flow: update, delete, and the two status writes.
 *
 * Split from app/actions/partner-jobs.ts, which held both the create and edit
 * flows in 795 lines. The two halves share only the constants in
 * lib/partner-jobs/action-constants.ts -- no helpers and no types cross the
 * seam, which is why it was worth splitting.
 *
 * Every partner-side write still ends in one recordPartnerJobEvent() call:
 * ONE EVENT PER USER ACTION, not per row touched.
 */

import { revalidatePath } from "next/cache";
import { getPartnerContext, partnerHomePath } from "@/lib/auth";
import { recordPartnerJobEvent } from "@/lib/partner-jobs/events";
import {
  deletePartnerJobSchema,
  partnerJobEditSchema,
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
  isAllowedPartnerExtension,
  isOwnPartnerJobFilePath,
  partnerExtensionOf,
  resolvePartnerContentType,
} from "@/lib/partner-jobs/uploads";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { NOT_A_PARTNER, NOT_CONFIGURED, PARTNER_JOB_BUCKET as BUCKET } from "@/lib/partner-jobs/action-constants";

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
