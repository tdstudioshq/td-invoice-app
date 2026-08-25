import Link from "next/link";
import { Factory } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { JobStatusBadge } from "@/components/partner-jobs/job-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getAllPartnerJobs } from "@/lib/partner-jobs/queries";

export const metadata = { title: "Partner Jobs" };

/**
 * Every design job filed through a print-partner portal, across all companies.
 *
 * Read through the service-role client (see lib/partner-jobs/queries.ts):
 * partner tables have no owner_id, so the cookie-scoped client sees nothing.
 * The (app) layout already enforces requireAdmin; re-asserted here for the same
 * defense-in-depth reason /mylar-requests does it.
 *
 * lucide icons and the mobile-cards / sm-table split, matching the rest of the
 * admin group.
 */
export default async function PartnerJobsPage() {
  await requireAdmin();
  const jobs = await getAllPartnerJobs();

  return (
    <>
      <PageHeader
        title="Partner Jobs"
        description="Design jobs submitted by print partners, newest first."
      />

      {jobs.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="No partner jobs yet"
          description="Jobs filed from a partner portal will land here."
        />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/partner-jobs/${job.id}`}
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
                    <dt className="text-muted-foreground text-xs">Partner</dt>
                    <dd className="mt-0.5 truncate">
                      {job.company?.name ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Products</dt>
                    <dd className="mt-0.5 tabular-nums">{job.item_count}</dd>
                  </div>
                  <div className="border-glass-border col-span-2 border-t pt-3">
                    <dt className="text-muted-foreground text-xs">Submitted</dt>
                    <dd className="mt-0.5">{formatDate(job.created_at)}</dd>
                  </div>
                </dl>
              </Link>
            ))}
          </div>

          <div className="glass hidden overflow-x-auto rounded-[8px] sm:block">
            <Table className="min-w-[720px]">
              <TableHeader className="bg-glass-highlight/10">
                <TableRow>
                  <TableHead className="px-4">Job</TableHead>
                  <TableHead className="px-4">Partner</TableHead>
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
                        href={`/partner-jobs/${job.id}`}
                        className="hover:text-metal-platinum transition-colors"
                      >
                        {job.job_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground px-4 py-3.5">
                      {job.company?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-64 truncate px-4 py-3.5">
                      {job.job_name}
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
