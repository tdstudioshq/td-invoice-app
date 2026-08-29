import "server-only";

import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { PREVIEWS_PER_JOB } from "@/lib/partner-jobs/types";
import { isPreviewableImage } from "@/lib/partner-jobs/uploads";
import type {
  AdminDesignJobDetail,
  AdminDesignJobListItem,
  DesignJobFile,
  DesignJobItem,
  DesignJobListItem,
  DesignJobPreview,
  DesignJobWithDetail,
  PartnerCompany,
  PartnerJobEvent,
} from "@/lib/types/database";

/**
 * Reads for the print-partner job portal.
 *
 * TWO CLIENTS, and which one a function uses IS its authorization model:
 *
 *   * `getPartnerJobs` / `getPartnerJob` use the COOKIE-SCOPED client. RLS
 *     (`design_jobs_partner_select` and friends) is what limits them to the
 *     caller's own company — these functions contain no company filter of their
 *     own for reads that RLS already scopes, so there is no second predicate to
 *     drift out of step with the policy.
 *
 *   * `getAllPartnerJobs` / `getAdminPartnerJob` / `getPartnerJobFile` use the
 *     SERVICE-ROLE client, because partner tables carry no `owner_id` and
 *     therefore have no admin policy to read through (see the migration header).
 *     Every caller must re-assert `requireAdmin()` — the same contract as
 *     lib/mylar-printing/queries.ts. Nothing here is safe to hand to a client
 *     component unfiltered.
 *
 * Item counts are gathered with one extra query and tallied in memory rather
 * than per row: PostgREST cannot group, and the alternative is N+1.
 */

const LIST_LIMIT = 200;
/** How many events a job's timeline / a company's feed shows at once. */
const EVENT_LIMIT = 50;

function countByJob(rows: { job_id: string }[] | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    counts.set(row.job_id, (counts.get(row.job_id) ?? 0) + 1);
  }
  return counts;
}

interface JobFileSummary {
  file_count: number;
  previews: DesignJobPreview[];
}

type FileSummaryRow = {
  id: string;
  job_id: string;
  original_filename: string;
  mime_type: string | null;
};

/**
 * Per-job file counts and the first few previewable images, for the jobs grid.
 *
 * ONE query for the whole page, grouped in memory — the same shape as
 * countByJob() above, and for the same reason: PostgREST cannot express
 * "the first four rows per group", and the alternative is N+1.
 *
 * Two things are deliberately capped here rather than in the UI. `previews` is
 * sliced to PREVIEWS_PER_JOB, so a job with twenty files can never turn into
 * twenty image requests; and only RASTER files qualify — a PDF/AI/PSD/EPS has
 * nothing a browser can draw, and an SVG is excluded for the same reason
 * previewKind() excludes it (an inline SVG can carry script).
 *
 * The result carries ids and names, never URLs: bytes are reached through
 * /api/partner-job-files/[id]?thumb=1, which is where authorization lives.
 */
function summarizeJobFiles(
  rows: FileSummaryRow[] | null,
): Map<string, JobFileSummary> {
  const summary = new Map<string, JobFileSummary>();
  for (const row of rows ?? []) {
    let entry = summary.get(row.job_id);
    if (!entry) {
      entry = { file_count: 0, previews: [] };
      summary.set(row.job_id, entry);
    }
    entry.file_count += 1;
    if (
      entry.previews.length < PREVIEWS_PER_JOB &&
      isPreviewableImage(row.original_filename) &&
      // A stored type that actively contradicts the extension is not drawn.
      // Null is tolerated: it predates the upload path setting one.
      (!row.mime_type || row.mime_type.toLowerCase().startsWith("image/"))
    ) {
      entry.previews.push({ id: row.id, name: row.original_filename });
    }
  }
  return summary;
}

const EMPTY_SUMMARY: JobFileSummary = { file_count: 0, previews: [] };

// ---------------------------------------------------------------------------
// Partner-side reads (cookie-scoped, RLS-enforced)
// ---------------------------------------------------------------------------

/** Every job the signed-in rep's company has filed, newest first. */
export async function getPartnerJobs(): Promise<DesignJobListItem[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("design_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (error) {
      console.error("getPartnerJobs", error.message);
      return [];
    }
    const jobs = data ?? [];
    if (jobs.length === 0) return [];

    const jobIds = jobs.map((job) => job.id);
    const [
      { data: items, error: itemError },
      { data: files, error: fileError },
    ] = await Promise.all([
      supabase.from("design_job_items").select("job_id").in("job_id", jobIds),
      supabase
        .from("design_job_files")
        // Only the four columns the grid needs — never storage_path, which has
        // no business in a list payload.
        .select("id, job_id, original_filename, mime_type")
        .in("job_id", jobIds)
        // Upload order, so a card's slideshow opens on the same image the job's
        // file list starts with.
        .order("created_at", { ascending: true }),
    ]);
    if (itemError) console.error("getPartnerJobs items", itemError.message);
    if (fileError) console.error("getPartnerJobs files", fileError.message);
    const counts = countByJob(items);
    const fileSummary = summarizeJobFiles(files);

    return jobs.map((job) => ({
      ...job,
      item_count: counts.get(job.id) ?? 0,
      ...(fileSummary.get(job.id) ?? EMPTY_SUMMARY),
    }));
  } catch (error) {
    console.error("getPartnerJobs", error);
    return [];
  }
}

/**
 * One job with its products and files, or null.
 *
 * RLS is the whole authorization here: a job id belonging to another company
 * simply returns no row, so this resolves to null rather than to somebody
 * else's work.
 */
export async function getPartnerJob(
  jobId: string,
): Promise<DesignJobWithDetail | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data: job, error } = await supabase
      .from("design_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (error) {
      console.error("getPartnerJob", error.message);
      return null;
    }
    if (!job) return null;

    const [{ data: items }, { data: files }] = await Promise.all([
      supabase
        .from("design_job_items")
        .select("*")
        .eq("job_id", jobId)
        // item_number, not created_at: an edit can add a product to a filed
        // job, and "Item 2" has to keep meaning the same product to the rep,
        // to the studio, and to the notes that reference it.
        .order("item_number", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("design_job_files")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true }),
    ]);

    return {
      ...job,
      items: (items ?? []) as DesignJobItem[],
      files: (files ?? []) as DesignJobFile[],
    };
  } catch (error) {
    console.error("getPartnerJob", error);
    return null;
  }
}

/**
 * Display names for the reps of the caller's own company, keyed by auth uid.
 * Readable under the `partner_users_select_company` policy, so this is scoped
 * to one company by RLS and returns nothing for anyone else.
 */
export async function getPartnerTeamNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!isSupabaseConfigured()) return names;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("partner_users")
      .select("user_id, display_name");
    for (const row of data ?? []) {
      if (row.display_name) names.set(row.user_id, row.display_name);
    }
  } catch (error) {
    console.error("getPartnerTeamNames", error);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Admin-side reads (service-role; every caller re-asserts requireAdmin())
// ---------------------------------------------------------------------------

/** Every partner job across every company, newest first. */
export async function getAllPartnerJobs(): Promise<AdminDesignJobListItem[]> {
  if (!isSupabaseAdminConfigured()) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("design_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    if (error) {
      console.error("getAllPartnerJobs", error.message);
      return [];
    }
    const jobs = data ?? [];
    if (jobs.length === 0) return [];

    const jobIds = jobs.map((job) => job.id);
    const [{ data: items }, { data: files }, { data: companies }] =
      await Promise.all([
        supabase.from("design_job_items").select("job_id").in("job_id", jobIds),
        supabase
          .from("design_job_files")
          .select("id, job_id, original_filename, mime_type")
          .in("job_id", jobIds)
          .order("created_at", { ascending: true }),
        supabase.from("partner_companies").select("id, name, slug"),
      ]);

    const counts = countByJob(items);
    const fileSummary = summarizeJobFiles(files);
    const byCompany = new Map(
      (companies ?? []).map((company) => [company.id, company]),
    );

    return jobs.map((job) => ({
      ...job,
      item_count: counts.get(job.id) ?? 0,
      ...(fileSummary.get(job.id) ?? EMPTY_SUMMARY),
      company: byCompany.get(job.company_id) ?? null,
    }));
  } catch (error) {
    console.error("getAllPartnerJobs", error);
    return [];
  }
}

/**
 * One job with everything the admin detail page shows, including who filed it.
 *
 * The submitter's email comes from `auth.admin.getUserById` rather than from a
 * join, because auth.users is not exposed through PostgREST. It is best effort:
 * a job whose submitter has since been deleted still renders.
 */
export async function getAdminPartnerJob(
  jobId: string,
): Promise<AdminDesignJobDetail | null> {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const supabase = createAdminClient();
    const { data: job, error } = await supabase
      .from("design_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (error) {
      console.error("getAdminPartnerJob", error.message);
      return null;
    }
    if (!job) return null;

    const [{ data: items }, { data: files }, { data: company }] =
      await Promise.all([
        supabase
          .from("design_job_items")
          .select("*")
          .eq("job_id", jobId)
          // Same ordering as the partner view — a rep and the studio must read
          // the identical list.
          .order("item_number", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("design_job_files")
          .select("*")
          .eq("job_id", jobId)
          .order("created_at", { ascending: true }),
        supabase
          .from("partner_companies")
          .select("*")
          .eq("id", job.company_id)
          .maybeSingle(),
      ]);

    let submittedByName: string | null = null;
    let submittedByEmail: string | null = null;
    if (job.submitted_by) {
      const { data: membership } = await supabase
        .from("partner_users")
        .select("display_name")
        .eq("user_id", job.submitted_by)
        .maybeSingle();
      submittedByName = membership?.display_name ?? null;
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(
          job.submitted_by,
        );
        submittedByEmail = authUser?.user?.email ?? null;
      } catch (authError) {
        console.error("getAdminPartnerJob submitter", authError);
      }
    }

    return {
      ...job,
      items: (items ?? []) as DesignJobItem[],
      files: (files ?? []) as DesignJobFile[],
      company: (company ?? null) as PartnerCompany | null,
      submitted_by_name: submittedByName,
      submitted_by_email: submittedByEmail,
    };
  } catch (error) {
    console.error("getAdminPartnerJob", error);
    return null;
  }
}

/**
 * A job file with its job proven, for the admin download path.
 *
 * The route is handed only a file id, so this join is what stops a valid file id
 * being used to reach a job the caller did not open — and, more importantly,
 * returns the `job_id` the route needs to build its audit context. Mirrors
 * `getMylarArtworkFile`.
 */
export async function getPartnerJobFile(
  fileId: string,
): Promise<DesignJobFile | null> {
  if (!isSupabaseAdminConfigured()) return null;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("design_job_files")
      .select("*")
      .eq("id", fileId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch (error) {
    console.error("getPartnerJobFile", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Activity events (migration 20260829000000)
// ---------------------------------------------------------------------------

/**
 * One job's activity timeline, as the REP sees it.
 *
 * Cookie-scoped, so `partner_job_events_partner_select` is the whole filter —
 * a job id from another company yields nothing rather than an error, exactly
 * like getPartnerJob() above.
 */
export async function getPartnerJobEvents(
  jobId: string,
): Promise<PartnerJobEvent[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("partner_job_events")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(EVENT_LIMIT);
    if (error) {
      console.error("getPartnerJobEvents", error.message);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error("getPartnerJobEvents", error);
    return [];
  }
}

/**
 * One job's activity timeline, as the STUDIO sees it.
 *
 * Service-role, like every other admin read here — partner tables have no
 * `owner_id` and so no admin policy to read through. Callers re-assert
 * `requireAdmin()`.
 */
export async function getAdminPartnerJobEvents(
  jobId: string,
): Promise<PartnerJobEvent[]> {
  if (!isSupabaseAdminConfigured()) return [];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("partner_job_events")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(EVENT_LIMIT);
    if (error) {
      console.error("getAdminPartnerJobEvents", error.message);
      return [];
    }
    return data ?? [];
  } catch (error) {
    console.error("getAdminPartnerJobEvents", error);
    return [];
  }
}
