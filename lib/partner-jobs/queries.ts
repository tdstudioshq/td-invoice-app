import "server-only";

import { createAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type {
  AdminDesignJobDetail,
  AdminDesignJobListItem,
  DesignJobFile,
  DesignJobItem,
  DesignJobListItem,
  DesignJobWithDetail,
  PartnerCompany,
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

function countByJob(rows: { job_id: string }[] | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    counts.set(row.job_id, (counts.get(row.job_id) ?? 0) + 1);
  }
  return counts;
}

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

    const { data: items, error: itemError } = await supabase
      .from("design_job_items")
      .select("job_id")
      .in(
        "job_id",
        jobs.map((job) => job.id),
      );
    if (itemError) console.error("getPartnerJobs items", itemError.message);
    const counts = countByJob(items);

    return jobs.map((job) => ({
      ...job,
      item_count: counts.get(job.id) ?? 0,
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

    const [{ data: items }, { data: companies }] = await Promise.all([
      supabase
        .from("design_job_items")
        .select("job_id")
        .in(
          "job_id",
          jobs.map((job) => job.id),
        ),
      supabase.from("partner_companies").select("id, name, slug"),
    ]);

    const counts = countByJob(items);
    const byCompany = new Map(
      (companies ?? []).map((company) => [company.id, company]),
    );

    return jobs.map((job) => ({
      ...job,
      item_count: counts.get(job.id) ?? 0,
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
