import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, PencilSimpleIcon } from "@phosphor-icons/react/dist/ssr";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { JobDoneCheckbox } from "@/components/partner-jobs/job-done-checkbox";
import { JobActivity } from "@/components/partner-jobs/job-activity";
import { DownloadAllFilesButton } from "@/components/partner-jobs/download-all-files-button";
import { JobFileList } from "@/components/partner-jobs/job-file-list";
import { JobProductList } from "@/components/partner-jobs/job-product-list";
import { JobStatusBadge } from "@/components/partner-jobs/job-status-badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import {
  partnerBasePath,
  partnerHref,
  requirePartnerSession,
} from "@/lib/partner-jobs/context";
import {
  getPartnerJob,
  getPartnerJobEvents,
  getPartnerTeamNames,
} from "@/lib/partner-jobs/queries";

export const metadata = { title: "Job" };

/**
 * One job, as the rep who filed it sees it.
 *
 * Edit opens the same form that filed it. Status is the one thing that does NOT
 * move from here: it is the studio's field, and a database trigger forces it
 * back on any rep-side write, so hiding the control is not what enforces it.
 *
 * The Done checkbox writes `status` — the same field the studio's Complete
 * checkbox writes — so this page and /partner-jobs are one answer. A rep may
 * only tick and un-tick; the Status dropdown stays the studio's, which is why
 * there is no status control here. See isJobDone().
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

  const jobLevelFiles = job.files.filter((file) => !file.item_id);

  const events = await getPartnerJobEvents(jobId);
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
          <JobDoneCheckbox job={job} labelled />
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
            {job.files.length > 1 ? (
              <CardAction>
                <DownloadAllFilesButton
                  files={job.files}
                  jobNumber={job.job_number}
                  label="Download all job files"
                />
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            <JobProductList
              items={job.items}
              files={job.files}
              jobNumber={job.job_number}
            />
          </CardContent>
        </Card>

        {/*
          Only files that belong to the JOB rather than to one of its products —
          in practice, jobs filed before artwork moved onto the products. The
          per-product files are rendered inside their product above, so listing
          the whole set here again would show every file twice. Hidden entirely
          when there are none, which is every job filed since.
        */}
        {jobLevelFiles.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>
                Job files
                <span className="text-muted-foreground ml-2 font-normal">
                  {jobLevelFiles.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <JobFileList files={jobLevelFiles} jobNumber={job.job_number} />
            </CardContent>
          </Card>
        ) : null}

        {job.notes ? (
          <Card>
            <CardHeader>
              <CardTitle>Job notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{job.notes}</p>
            </CardContent>
          </Card>
        ) : null}

        {/*
          The rep's own record of what has happened to this job — read under
          their session, so `partner_job_events_partner_select` scopes it to
          their company. They can read it and nothing else: there is no insert,
          update or delete policy, so the log is not theirs to amend.
        */}
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <JobActivity events={events} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
