"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { partnerHomePath, requireAdmin } from "@/lib/auth";
import { PARTNER_JOB_BUCKET as BUCKET } from "@/lib/partner-jobs/action-constants";
import { recordPartnerJobEvent } from "@/lib/partner-jobs/events";
import { renderPartnerPreviewsAfterResponse } from "@/lib/partner-jobs/previews";
import {
  deletePartnerJobSchema,
  discardPartnerUploadsSchema,
  mintPartnerUploadsSchema,
  partnerJobEditSchema,
  partnerJobSubmissionSchema,
  type JobFileInput,
} from "@/lib/partner-jobs/schema";
import { MAX_JOB_FILES } from "@/lib/partner-jobs/types";
import {
  MAX_PARTNER_UPLOAD_BYTES,
  buildPartnerJobFilePath,
  isAllowedPartnerExtension,
  isOwnPartnerJobFilePath,
  partnerExtensionOf,
  resolvePartnerContentType,
  validatePartnerUploadFile,
  withPartnerPreviewPaths,
} from "@/lib/partner-jobs/uploads";
import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import type {
  DiscardPartnerUploadsResult,
  MintPartnerUploadsResult,
  PartnerUploadRejection,
  PartnerUploadTicket,
  SubmitPartnerJobResult,
} from "@/app/actions/partner-jobs";
import type { EditPartnerJobResult } from "@/app/actions/partner-job-edits";

/**
 * The STUDIO's half of the job form: filing a job for a partner company,
 * editing one, and uploading its files. The same `NewJobForm` drives both
 * halves — each page hands it the action set that matches who is signed in —
 * so the rep and the studio fill in one form and produce identical rows.
 *
 * Every export takes the company id as its FIRST argument, bound on the server
 * page (`action.bind(null, companyId)`), and re-asserts `requireAdmin()` before
 * reading anything. The service role is required rather than convenient: the
 * partner tables and the `partner-job-files` bucket carry only company-scoped
 * policies, so there is nothing for an admin session to write through. Because
 * the service role bypasses RLS, every check the partner path gets from its
 * policies — this job belongs to this company, this object sits under this
 * job's prefix — is written out here instead, and in the two `admin_*` RPCs
 * (migration 20260926120000).
 *
 * Every write still ends in exactly one recordPartnerJobEvent(), as a studio
 * actor, so the company's activity log shows what the studio did.
 */

const NOT_CONFIGURED = "Supabase admin access is not configured.";
const NO_COMPANY = "That partner company couldn't be found, or it's inactive.";
const STUDIO = "TD Studios";

interface Company {
  id: string;
  name: string;
  slug: string;
}

async function loadCompany(companyId: string): Promise<Company | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const { data } = await createAdminClient()
    .from("partner_companies")
    .select("id, name, slug, active")
    .eq("id", companyId)
    .maybeSingle();
  if (!data || !data.active) return null;
  return { id: data.id, name: data.name, slug: data.slug };
}

/** The job's company id, or null when there is no such job. */
async function jobCompanyId(jobId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("design_jobs")
    .select("company_id")
    .eq("id", jobId)
    .maybeSingle();
  return data?.company_id ?? null;
}

function revalidateJobViews(company: Company, jobId?: string) {
  revalidatePath("/partner-jobs");
  revalidatePath(partnerHomePath(company.slug));
  if (jobId) {
    revalidatePath(`/partner-jobs/${jobId}`);
    revalidatePath(`${partnerHomePath(company.slug)}/${jobId}`);
  }
}

type VerifiedFile = {
  item_id: string | null;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
};

/**
 * Prove every claimed object lives under this job's prefix and read its real
 * size and type back from Storage — the browser's numbers are never trusted.
 */
async function verifyFiles(
  files: JobFileInput[],
  companyId: string,
  jobId: string,
): Promise<{ files: VerifiedFile[] } | { error: string }> {
  const supabase = createAdminClient();
  const verified: VerifiedFile[] = [];
  for (const file of files) {
    if (!isOwnPartnerJobFilePath(file.path, companyId, jobId)) {
      return { error: "One of those files couldn't be verified. Remove it and try again." };
    }
    if (!isAllowedPartnerExtension(partnerExtensionOf(file.name))) {
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
      item_id: file.itemId,
      storage_path: file.path,
      original_filename: file.name,
      mime_type: info.contentType || resolvePartnerContentType(file.name, null),
      file_size: size,
    });
  }
  return { files: verified };
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Signed upload URLs under `{companyId}/{jobId}/`, like the partner path. */
export async function adminCreatePartnerJobUploadTicketsAction(
  companyId: string,
  input: { jobId: string | null; files: { name: string; size: number; type: string | null }[] },
): Promise<MintPartnerUploadsResult> {
  await requireAdmin();
  const company = await loadCompany(companyId);
  if (!company) return { error: isSupabaseAdminConfigured() ? NO_COMPANY : NOT_CONFIGURED };

  const parsed = mintPartnerUploadsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid upload request." };
  }

  // An existing job must belong to this company; an unknown id is a new job's
  // freshly minted one, which nothing else can be anchored to yet.
  const jobId = parsed.data.jobId ?? randomUUID();
  const owner = await jobCompanyId(jobId);
  if (owner && owner !== company.id) return { error: "That job couldn't be found." };

  const supabase = createAdminClient();
  const tickets: (PartnerUploadTicket | PartnerUploadRejection)[] = [];
  for (const file of parsed.data.files) {
    const invalid = validatePartnerUploadFile(file.name, file.size, file.type);
    if (invalid) {
      tickets.push({ name: file.name, ok: false, error: invalid });
      continue;
    }
    const path = buildPartnerJobFilePath(company.id, jobId, randomUUID(), file.name);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error("adminCreatePartnerJobUploadTicketsAction", error?.message);
      tickets.push({ name: file.name, ok: false, error: "Couldn't start that upload. Try again." });
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

/** File a new job for the company, atomically, attributed to the admin. */
export async function adminSubmitPartnerJobAction(
  companyId: string,
  input: unknown,
): Promise<SubmitPartnerJobResult> {
  const user = await requireAdmin();
  const company = await loadCompany(companyId);
  if (!company) return { error: isSupabaseAdminConfigured() ? NO_COMPANY : NOT_CONFIGURED };

  const parsed = partnerJobSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Please check the highlighted details and try again.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }
  const submission = parsed.data;
  if (submission.files.length > 0 && !submission.jobId) {
    return { error: "Those files couldn't be matched to this job. Attach them again." };
  }
  const jobId = submission.jobId ?? randomUUID();

  const itemIds = new Set(submission.items.map((item) => item.id));
  if (submission.files.some((file) => file.itemId && !itemIds.has(file.itemId))) {
    return { error: "A file is attached to a product that's no longer on this job. Reload and try again." };
  }

  const checked = await verifyFiles(submission.files, company.id, jobId);
  if ("error" in checked) return { error: checked.error };

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("admin_create_design_job", {
    p_company_id: company.id,
    p_job_id: jobId,
    p_job_name: submission.jobName,
    p_notes: submission.notes || null,
    p_items: submission.items.map((item, index) => ({
      id: item.id,
      product_type: item.productType,
      finish: item.finish,
      quantity: item.quantity,
      notes: item.notes || null,
      item_number: index + 1,
    })),
    p_files: checked.files,
    p_actor: user?.id ?? null,
  });

  if (error) {
    // Same idempotency as the partner path: this exact submission landed.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("design_jobs")
        .select("id, job_number, company_id")
        .eq("id", jobId)
        .maybeSingle();
      if (existing && existing.company_id === company.id) {
        return { jobId: existing.id, jobNumber: existing.job_number };
      }
    }
    console.error("adminSubmitPartnerJobAction", error.code, error.message);
    return { error: "We couldn't file that job. Nothing was saved — please try again." };
  }
  const created = Array.isArray(data) ? data[0] : data;
  if (!created?.job_id) return { error: "We couldn't file that job. Please try again." };

  await recordPartnerJobEvent({
    jobId: created.job_id,
    jobNumber: created.job_number,
    jobName: submission.jobName,
    companyId: company.id,
    companyName: company.name,
    eventType: "job.created",
    actor: { kind: "studio", label: STUDIO },
    actorDisplay: STUDIO,
    summary: `${submission.items.length} ${submission.items.length === 1 ? "product" : "products"}`,
    metadata: { products: submission.items.length, files: checked.files.length },
  });

  renderPartnerPreviewsAfterResponse(checked.files.map((file) => file.storage_path));

  revalidateJobViews(company, created.job_id);
  return { jobId: created.job_id, jobNumber: created.job_number };
}

/** Save an edit — details, products, files added and removed. */
export async function adminUpdatePartnerJobAction(
  companyId: string,
  input: unknown,
): Promise<EditPartnerJobResult> {
  const user = await requireAdmin();
  const company = await loadCompany(companyId);
  if (!company) return { error: isSupabaseAdminConfigured() ? NO_COMPANY : NOT_CONFIGURED };

  const parsed = partnerJobEditSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Please check the highlighted details and try again.",
      fieldErrors: fieldErrorsOf(parsed.error.issues),
    };
  }
  const edit = parsed.data;
  if ((await jobCompanyId(edit.jobId)) !== company.id) {
    return { error: "That job couldn't be found." };
  }

  const supabase = createAdminClient();
  const [{ data: existing }, { data: existingItems }] = await Promise.all([
    supabase.from("design_job_files").select("id, storage_path, item_id").eq("job_id", edit.jobId),
    supabase.from("design_job_items").select("id").eq("job_id", edit.jobId),
  ]);
  const current = existing ?? [];

  const byId = new Map(current.map((f) => [f.id, f.storage_path]));
  const removePaths: string[] = [];
  for (const id of edit.removeFileIds) {
    const path = byId.get(id);
    if (!path) return { error: "One of those files is no longer on this job. Reload and try again." };
    removePaths.push(path);
  }

  const keptItemIds = new Set(edit.items.map((item) => item.id));
  if (edit.addFiles.some((file) => file.itemId && !keptItemIds.has(file.itemId))) {
    return { error: "A file is attached to a product that's no longer on this job. Reload and try again." };
  }
  // Removed products take their artwork with them: rows by cascade inside the
  // RPC, objects by hand afterwards (the same split as the partner edit).
  const droppedItemIds = (existingItems ?? [])
    .map((item) => item.id)
    .filter((id) => !keptItemIds.has(id));
  const cascadePaths = current
    .filter((f) => f.item_id && droppedItemIds.includes(f.item_id))
    .map((f) => f.storage_path)
    .filter((path) => !removePaths.includes(path));

  const remaining =
    current.length - removePaths.length - cascadePaths.length + edit.addFiles.length;
  if (remaining > MAX_JOB_FILES) {
    return { error: `A job can hold at most ${MAX_JOB_FILES} files.` };
  }

  const checked = await verifyFiles(edit.addFiles, company.id, edit.jobId);
  if ("error" in checked) return { error: checked.error };

  const { data, error } = await supabase.rpc("admin_update_design_job", {
    p_company_id: company.id,
    p_job_id: edit.jobId,
    p_job_name: edit.jobName,
    p_notes: edit.notes || null,
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
    console.error("adminUpdatePartnerJobAction rpc", error.code, error.message);
    return { error: "We couldn't save those changes. Nothing was modified — try again." };
  }
  const saved = Array.isArray(data) ? data[0] : data;
  if (!saved?.job_id) return { error: "We couldn't save those changes. Try again." };

  if (checked.files.length > 0) {
    const { error: addError } = await supabase.from("design_job_files").insert(
      checked.files.map((file) => ({
        ...file,
        job_id: edit.jobId,
        uploaded_by: user?.id ?? null,
      })),
    );
    if (addError) {
      console.error("adminUpdatePartnerJobAction add files", addError.message);
      return { error: "Your changes saved, but the new files didn't attach. Try adding them again." };
    }
  }
  if (edit.removeFileIds.length > 0) {
    const { error: delError } = await supabase
      .from("design_job_files")
      .delete()
      .in("id", edit.removeFileIds)
      .eq("job_id", edit.jobId);
    if (delError) {
      console.error("adminUpdatePartnerJobAction remove files", delError.message);
      return { error: "Your changes saved, but a file couldn't be removed. Try again." };
    }
  }
  const orphaned = [...removePaths, ...cascadePaths];
  if (orphaned.length > 0) {
    const { error: objError } = await supabase.storage
      .from(BUCKET)
      .remove(withPartnerPreviewPaths(orphaned));
    if (objError) console.error("adminUpdatePartnerJobAction storage remove", objError.message);
  }

  const filesAdded = checked.files.length;
  const filesRemoved = orphaned.length;
  const changes = [
    filesAdded > 0 ? `${filesAdded} added` : null,
    filesRemoved > 0 ? `${filesRemoved} removed` : null,
  ].filter(Boolean);
  await recordPartnerJobEvent({
    jobId: edit.jobId,
    jobNumber: saved.job_number,
    jobName: edit.jobName,
    companyId: company.id,
    companyName: company.name,
    eventType: filesAdded > 0 ? "file.added" : filesRemoved > 0 ? "file.removed" : "job.updated",
    actor: { kind: "studio", label: STUDIO },
    actorDisplay: STUDIO,
    summary: changes.length > 0 ? `artwork ${changes.join(", ")}` : "products and details saved",
    metadata: { filesAdded, filesRemoved, products: edit.items.length },
  });

  renderPartnerPreviewsAfterResponse(checked.files.map((file) => file.storage_path));

  revalidateJobViews(company, edit.jobId);
  return { jobId: saved.job_id, jobNumber: saved.job_number };
}

/**
 * Delete a job and its artwork. A job with an invoice attached is refused by
 * the `on delete restrict` foreign key, which is reported as a sentence.
 */
export async function adminDeletePartnerJobAction(
  companyId: string,
  input: unknown,
): Promise<{ error: string } | { deleted: true }> {
  await requireAdmin();
  const company = await loadCompany(companyId);
  if (!company) return { error: isSupabaseAdminConfigured() ? NO_COMPANY : NOT_CONFIGURED };

  const parsed = deletePartnerJobSchema.safeParse(input);
  if (!parsed.success) return { error: "That job couldn't be found." };
  const { jobId } = parsed.data;

  const supabase = createAdminClient();
  const { data: files } = await supabase
    .from("design_job_files")
    .select("storage_path")
    .eq("job_id", jobId);
  const paths = (files ?? []).map((f) => f.storage_path);

  const { data: deleted, error } = await supabase
    .from("design_jobs")
    .delete()
    .eq("id", jobId)
    .eq("company_id", company.id)
    .select("id, job_number, job_name");
  if (error) {
    if (error.code === "23503") {
      return { error: "This job has an invoice or payments on it. Detach the invoice and remove its payments first." };
    }
    console.error("adminDeletePartnerJobAction", error.message);
    return { error: "We couldn't delete that job. Try again." };
  }
  if (!deleted || deleted.length === 0) return { error: "That job couldn't be found." };

  if (paths.length > 0) {
    const { error: objError } = await supabase.storage
      .from(BUCKET)
      .remove(withPartnerPreviewPaths(paths));
    if (objError) console.error("adminDeletePartnerJobAction storage", objError.message);
  }

  await recordPartnerJobEvent({
    jobId: null,
    jobNumber: deleted[0].job_number,
    jobName: deleted[0].job_name,
    companyId: company.id,
    companyName: company.name,
    eventType: "job.deleted",
    actor: { kind: "studio", label: STUDIO },
    actorDisplay: STUDIO,
  });

  revalidateJobViews(company);
  return { deleted: true };
}

/** Drop objects uploaded for a new job that never landed. */
export async function adminDiscardPartnerJobFilesAction(
  companyId: string,
  input: { jobId: string; paths: string[] },
): Promise<DiscardPartnerUploadsResult> {
  await requireAdmin();
  const company = await loadCompany(companyId);
  if (!company) return { ok: false };

  const parsed = discardPartnerUploadsSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { jobId, paths } = parsed.data;
  if (!paths.every((path) => isOwnPartnerJobFilePath(path, company.id, jobId))) {
    return { ok: false };
  }
  // A filed job's files are its record; only a never-filed job's are orphans.
  if (await jobCompanyId(jobId)) return { ok: true };

  const { error } = await createAdminClient().storage.from(BUCKET).remove(paths);
  if (error) {
    console.error("adminDiscardPartnerJobFilesAction", error.message);
    return { ok: false };
  }
  return { ok: true };
}
