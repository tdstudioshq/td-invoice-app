import Link from "next/link";
import { Factory } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { AdminJobCompleteCheckbox } from "@/components/partner-jobs/admin-job-complete-checkbox";
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
import { isJobDone, splitJobsByCompletion } from "@/lib/partner-jobs/types";
import type { AdminDesignJobListItem } from "@/lib/types/database";
import { cn } from "@/lib/utils";

export const metadata = { title: "Partner Jobs" };

/**
 * Every design job filed through a print-partner portal, across all companies.
 *
 * TWO SECTIONS, ONE FIELD. "Complete" is `status === "completed"` and
 * "In progress" is everything else — `new` and `in_progress` together, since
 * from the studio's side both mean the job is still on the pile. The checkbox
 * beside each job writes that same field, which is what stops a ticked box and
 * the section it sits in from ever disagreeing, and it is the SAME field the
 * rep's checkbox writes in their own portal — so this page and the Zaza portal
 * are one answer (migration 20260829180000).
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
  const { inProgress, complete } = splitJobsByCompletion(jobs);

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
        <div className="space-y-8">
          <JobSection
            title="In progress"
            jobs={inProgress}
            emptyNote="Nothing outstanding — every job is complete."
          />
          <JobSection
            title="Complete"
            jobs={complete}
            emptyNote="Tick a job off above and it will move here."
          />
        </div>
      )}
    </>
  );
}

/**
 * One section: a heading with its count, then the same mobile-cards / table
 * pair the page has always used.
 *
 * Both sections render even when empty, with a one-line note. A section that
 * disappeared would read as a missing feature rather than as an empty pile —
 * and "Complete" is empty on day one by definition.
 */
function JobSection({
  title,
  jobs,
  emptyNote,
}: {
  title: string;
  jobs: AdminDesignJobListItem[];
  emptyNote: string;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2 text-sm tracking-wide uppercase">
        {title}
        <span className="text-muted-foreground font-normal tabular-nums">
          {jobs.length}
        </span>
      </h2>

      {jobs.length === 0 ? (
        <p className="border-glass-border text-muted-foreground rounded-[8px] border border-dashed px-4 py-6 text-center text-sm">
          {emptyNote}
        </p>
      ) : (
        <>
          {/*
            The checkbox is a SIBLING of the card's link, not inside it: a
            <button> nested in an <a> is invalid HTML.
          */}
          <div className="space-y-3 sm:hidden">
            {jobs.map((job) => (
              <div
                key={job.id}
                className={cn(
                  "glass flex items-start gap-3 rounded-[8px] p-4",
                  isJobDone(job) && "opacity-75",
                )}
              >
                <AdminJobCompleteCheckbox job={job} className="mt-0.5" />
                <Link href={`/partner-jobs/${job.id}`} className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{job.job_number}</p>
                      <p
                        className={cn(
                          "text-muted-foreground mt-0.5 truncate text-sm",
                          isJobDone(job) && "line-through",
                        )}
                      >
                        {job.job_name}
                      </p>
                    </div>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">Partner</dt>
                      <dd className="mt-0.5 truncate">
                        {job.company?.name ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">Products</dt>
                      <dd className="mt-0.5 tabular-nums">{job.item_count}</dd>
                    </div>
                    <div className="border-glass-border col-span-2 border-t pt-3">
                      <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">Submitted</dt>
                      <dd className="mt-0.5">{formatDate(job.created_at)}</dd>
                    </div>
                  </dl>
                </Link>
              </div>
            ))}
          </div>

          <div className="glass hidden overflow-x-auto rounded-[8px] sm:block">
            <Table className="min-w-[760px]">
              <TableHeader className="bg-glass-highlight/10">
                <TableRow>
                  <TableHead className="w-10 pl-4">
                    <span className="sr-only">Complete</span>
                  </TableHead>
                  <TableHead className="px-4">Job</TableHead>
                  <TableHead className="px-4">Partner</TableHead>
                  <TableHead className="px-4">Name</TableHead>
                  <TableHead className="px-4 text-right">Products</TableHead>
                  <TableHead className="px-4">Submitted</TableHead>
                  <TableHead className="px-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const done = isJobDone(job);
                  return (
                    <TableRow
                      key={job.id}
                      className="hover:bg-glass-highlight/10 transition-colors"
                    >
                      <TableCell className="w-10 py-3.5 pl-4">
                        <AdminJobCompleteCheckbox job={job} />
                      </TableCell>
                      <TableCell
                        className={cn(
                          "px-4 py-3.5 font-medium",
                          done && "text-muted-foreground",
                        )}
                      >
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
                      <TableCell
                        className={cn(
                          "text-muted-foreground max-w-64 truncate px-4 py-3.5",
                          done && "line-through",
                        )}
                      >
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
