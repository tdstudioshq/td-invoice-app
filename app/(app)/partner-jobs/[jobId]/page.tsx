import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { JobFileList } from "@/components/partner-jobs/job-file-list";
import { JobProductList } from "@/components/partner-jobs/job-product-list";
import { JobActivity } from "@/components/partner-jobs/job-activity";
import { JobStatusBadge } from "@/components/partner-jobs/job-status-badge";
import { PartnerJobStatusForm } from "@/components/partner-jobs/admin-status-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import {
  getAdminPartnerJob,
  getAdminPartnerJobEvents,
} from "@/lib/partner-jobs/queries";

export const metadata = { title: "Partner Job" };

/** One labelled value in the detail cards. Mirrors /mylar-requests/[id]. */
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-sm leading-relaxed md:text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

export default async function PartnerJobDetailPage(
  props: PageProps<"/partner-jobs/[jobId]">,
) {
  await requireAdmin();
  const { jobId } = await props.params;

  const job = await getAdminPartnerJob(jobId);
  if (!job) notFound();

  const events = await getAdminPartnerJobEvents(jobId);

  const jobLevelFiles = job.files.filter((file) => !file.item_id);

  return (
    <>
      <Link
        href="/partner-jobs"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Partner jobs
      </Link>

      <PageHeader title={job.job_number} description={job.job_name}>
        <JobStatusBadge status={job.status} className="h-7 self-start" />
      </PageHeader>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Submission</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Detail label="Partner">{job.company?.name ?? "—"}</Detail>
              <Detail label="Submitted by">
                {job.submitted_by_name ?? job.submitted_by_email ?? "—"}
              </Detail>
              <Detail label="Submitted">
                {formatDateTime(job.created_at)}
              </Detail>
              {/*
                The PARTNER's own answer, read-only here. It is a separate
                column from `status` precisely so the two sides cannot overwrite
                each other — the rep saying they are finished is not the studio
                saying the job is complete, and the Status card below is still
                the only thing that moves `status`.
              */}
              <Detail label="Partner marked done">
                {job.partner_done_at ? formatDateTime(job.partner_done_at) : "—"}
              </Detail>
            </dl>

            {job.submitted_by_email ? (
              <div className="border-glass-border border-t pt-4">
                <Button asChild variant="outline" size="sm">
                  <a href={`mailto:${job.submitted_by_email}`}>
                    <Mail className="size-4" />
                    {job.submitted_by_email}
                  </a>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <PartnerJobStatusForm id={job.id} status={job.status} />
          </CardContent>
        </Card>

        {/*
          The same rows the notification emails are dispatched from — every
          entry here either did, or deliberately did not, send one (see
          NOTIFIABLE_PARTNER_JOB_EVENTS). Read through the service role, like
          every other partner read on this page.
        */}
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <JobActivity events={events} />
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
      </div>
    </>
  );
}
