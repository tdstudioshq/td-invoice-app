import Link from "next/link";
import { cookies } from "next/headers";
import { PlusIcon, StackIcon } from "@phosphor-icons/react/dist/ssr";

import { PageHeader } from "@/components/layout/page-header";
import { JobTabs } from "@/components/partner-jobs/job-tabs";
import { JobsBrowser } from "@/components/partner-jobs/jobs-browser";
import { Button } from "@/components/ui/button";
import {
  partnerBasePath,
  partnerHref,
  requirePartnerSession,
} from "@/lib/partner-jobs/context";
import { getPartnerJobs } from "@/lib/partner-jobs/queries";
import {
  PARTNER_JOB_VIEW_COOKIE,
  countPartnerJobsByTab,
  filterPartnerJobsByTab,
  parsePartnerJobTab,
  parsePartnerJobView,
} from "@/lib/partner-jobs/types";

export const metadata = { title: "Jobs" };

/**
 * The rep's dashboard: every job their company has filed.
 *
 * TWO KINDS OF CONTROL, AND THEY LIVE IN DIFFERENT PLACES ON PURPOSE.
 *
 *   * The status TABS are a place — they belong in the URL (`?tab=`), are
 *     bookmarkable, and are resolved here in the server component. They are also
 *     a partition, so the counts sum to All (see partnerJobTab()).
 *   * Search, sort and grid/list are how you are looking at that place right
 *     now. They live in JobsBrowser, client-side and instant, over the ≤200 rows
 *     this page already holds.
 *
 * The chosen VIEW is read from a cookie here rather than from localStorage in
 * the browser, so a rep who prefers the list gets the list on the first paint
 * instead of watching a grid flash and swap.
 *
 * `getPartnerJobs()` is RLS-scoped, so this page has no company filter of its
 * own; the session guard decides who may see it, and Postgres decides what is
 * in it.
 */
export default async function PartnerJobsPage({
  params,
  searchParams,
}: PageProps<"/partner/[slug]/jobs">) {
  const { slug } = await params;
  await requirePartnerSession(slug, "/jobs");

  const basePath = await partnerBasePath(slug);
  const allJobs = await getPartnerJobs();

  const { tab: tabParam } = await searchParams;
  const tab = parsePartnerJobTab(
    Array.isArray(tabParam) ? tabParam[0] : tabParam,
  );
  const counts = countPartnerJobsByTab(allJobs);
  const jobs = filterPartnerJobsByTab(allJobs, tab);

  const view = parsePartnerJobView(
    (await cookies()).get(PARTNER_JOB_VIEW_COOKIE)?.value,
  );

  return (
    <>
      <PageHeader
        title="Design Jobs"
        description="Everything you've sent over."
      >
        <Button asChild className="w-full sm:w-auto">
          <Link href={partnerHref(basePath, "/jobs/new")}>
            <PlusIcon className="size-4" weight="bold" />
            New Job
          </Link>
        </Button>
      </PageHeader>

      {allJobs.length === 0 ? (
        <div className="border-glass-border flex flex-col items-center justify-center rounded-[10px] border border-dashed px-6 py-16 text-center">
          <div className="border-glass-border bg-glass-highlight/15 text-metal-platinum mb-4 flex size-12 items-center justify-center rounded-[10px] border">
            <StackIcon className="size-5" />
          </div>
          <p className="text-sm font-medium">No jobs yet</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Send your first design job over and it will show up here with its
            status.
          </p>
          <div className="mt-5">
            <Button asChild>
              <Link href={partnerHref(basePath, "/jobs/new")}>
                <PlusIcon className="size-4" weight="bold" />
                New Job
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <JobTabs basePath={basePath} active={tab} counts={counts} />

          {jobs.length === 0 ? (
            // An empty TAB, not an empty portal. The chips above are the way
            // back, so this does not re-offer "New Job".
            <div className="border-glass-border rounded-[10px] border border-dashed px-6 py-14 text-center">
              <p className="text-sm font-medium">
                {tab === "done" ? "Nothing ticked off yet" : "Nothing here"}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {tab === "done"
                  ? "Tick a job off with the circle beside it and it will move here."
                  : "No jobs are in this state right now."}
              </p>
            </div>
          ) : (
            <JobsBrowser jobs={jobs} basePath={basePath} initialView={view} />
          )}
        </>
      )}
    </>
  );
}
