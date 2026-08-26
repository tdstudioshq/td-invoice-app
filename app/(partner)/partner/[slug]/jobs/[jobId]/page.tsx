import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, PencilSimpleIcon } from "@phosphor-icons/react/dist/ssr";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { JobFileList } from "@/components/partner-jobs/job-file-list";
import { JobItemTable } from "@/components/partner-jobs/job-item-table";
import { JobStatusBadge } from "@/components/partner-jobs/job-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import {
  partnerBasePath,
  partnerHref,
  requirePartnerSession,
} from "@/lib/partner-jobs/context";
import { getPartnerJob, getPartnerTeamNames } from "@/lib/partner-jobs/queries";

export const metadata = { title: "Job" };

/**
 * One job, as the rep who filed it sees it.
 *
 * Edit opens the same form that filed it. Status is the one thing that does NOT
 * move from here: it is the studio's field, and a database trigger forces it
 * back on any rep-side write, so hiding the control is not what enforces it.
 */
export default async function PartnerJobDetailPage({
  params,
}: PageProps<"/partner/[slug]/jobs/[jobId]">) {
  const { slug, jobId } = await params;
  const partner = await requirePartnerSession(slug, `/jobs/${jobId}`);
  const basePath = await partnerBasePath(slug);

  // RLS scopes this read, so a job id from another company resolves to null and
  // 404s here rather than rendering anything.
  const job = await getPartnerJob(jobId);
  if (!job) notFound();

  const teamNames = await getPartnerTeamNames();
  const submittedBy =
    (job.submitted_by ? teamNames.get(job.submitted_by) : null) ??
    (job.submitted_by === partner.userId ? (partner.displayName ?? partner.email) : null) ??
    "—";

  return (
    <>
      <Link
        href={partnerHref(basePath, "/jobs")}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeftIcon className="size-4" />
        All jobs
      </Link>

      <PageHeader title={job.job_number} description={job.job_name}>
        <div className="flex items-center gap-3">
          <JobStatusBadge status={job.status} className="h-7" />
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={partnerHref(basePath, `/jobs/${job.id}/edit`)}>
              <PencilSimpleIcon className="size-4" />
              Edit
            </Link>
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">Submitted by</dt>
                <dd className="mt-0.5 text-sm break-words">{submittedBy}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">Submitted</dt>
                <dd className="mt-0.5 text-sm">
                  {formatDateTime(job.created_at)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">Status</dt>
                <dd className="mt-1">
                  <JobStatusBadge status={job.status} />
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Products
              <span className="text-muted-foreground ml-2 font-normal">
                {job.items.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <JobItemTable items={job.items} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Files
              <span className="text-muted-foreground ml-2 font-normal">
                {job.files.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <JobFileList files={job.files} />
          </CardContent>
        </Card>

        {job.notes ? (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{job.notes}</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
