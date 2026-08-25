import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { JobFileList } from "@/components/partner-jobs/job-file-list";
import { JobItemTable } from "@/components/partner-jobs/job-item-table";
import { JobStatusBadge } from "@/components/partner-jobs/job-status-badge";
import { PartnerJobStatusForm } from "@/components/partner-jobs/admin-status-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { getAdminPartnerJob } from "@/lib/partner-jobs/queries";

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
      <dt className="text-muted-foreground text-xs">{label}</dt>
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
