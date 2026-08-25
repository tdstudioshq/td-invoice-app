import Link from "next/link";
import { PlusIcon, StackIcon } from "@phosphor-icons/react/dist/ssr";

import { PageHeader } from "@/components/layout/page-header";
import { JobStatusBadge } from "@/components/partner-jobs/job-status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import {
  partnerBasePath,
  partnerHref,
  requirePartnerSession,
} from "@/lib/partner-jobs/context";
import { getPartnerJobs } from "@/lib/partner-jobs/queries";

export const metadata = { title: "Jobs" };

/**
 * The rep's dashboard: every job their company has filed, newest first.
 *
 * Deliberately minimal — no charts, no counters. A sales rep opens this to file
 * the next job or to check on the last one, and both should be one glance and
 * one tap away.
 *
 * `getPartnerJobs()` is RLS-scoped, so this page has no company filter of its
 * own; the session guard above decides who may see the page, and Postgres
 * decides what is in it.
 */
export default async function PartnerJobsPage({
  params,
}: PageProps<"/partner/[slug]/jobs">) {
  const { slug } = await params;
  await requirePartnerSession(slug, "/jobs");

  const basePath = await partnerBasePath(slug);
  const jobs = await getPartnerJobs();

  return (
    <>
      <PageHeader
        title="Design Jobs"
        description="Everything you've sent over, newest first."
      >
        <Button asChild className="w-full sm:w-auto">
          <Link href={partnerHref(basePath, "/jobs/new")}>
            <PlusIcon className="size-4" weight="bold" />
            New Job
          </Link>
        </Button>
      </PageHeader>

      {jobs.length === 0 ? (
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
          <div className="space-y-3 sm:hidden">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={partnerHref(basePath, `/jobs/${job.id}`)}
                className="glass active:bg-glass-highlight/20 block rounded-[8px] p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{job.job_number}</p>
                    <p className="text-muted-foreground mt-0.5 truncate text-sm">
                      {job.job_name}
                    </p>
                  </div>
                  <JobStatusBadge status={job.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">Products</dt>
                    <dd className="mt-0.5 tabular-nums">
                      {job.item_count}
                      {job.item_count === 1 ? " item" : " items"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Submitted</dt>
                    <dd className="mt-0.5">{formatDate(job.created_at)}</dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>

          <div className="glass hidden overflow-x-auto rounded-[8px] sm:block">
            <Table className="min-w-[640px]">
              <TableHeader className="bg-glass-highlight/10">
                <TableRow>
                  <TableHead className="px-4">Job</TableHead>
                  <TableHead className="px-4">Name</TableHead>
                  <TableHead className="px-4 text-right">Products</TableHead>
                  <TableHead className="px-4">Submitted</TableHead>
                  <TableHead className="px-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow
                    key={job.id}
                    className="hover:bg-glass-highlight/10 transition-colors"
                  >
                    <TableCell className="px-4 py-3.5 font-medium">
                      <Link
                        href={partnerHref(basePath, `/jobs/${job.id}`)}
                        className="hover:text-metal-platinum transition-colors"
                      >
                        {job.job_number}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72 truncate px-4 py-3.5">
                      <Link
                        href={partnerHref(basePath, `/jobs/${job.id}`)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {job.job_name}
                      </Link>
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-right tabular-nums">
                      {job.item_count}
                    </TableCell>
                    <TableCell className="text-muted-foreground px-4 py-3.5 whitespace-nowrap">
                      {formatDate(job.created_at)}
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
