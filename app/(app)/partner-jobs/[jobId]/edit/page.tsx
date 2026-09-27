import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { NewJobForm } from "@/components/partner-jobs/new-job-form";
import { requireAdmin } from "@/lib/auth";
import { adminJobFormActions } from "@/lib/partner-jobs/admin-form-actions";
import { getAdminPartnerJob } from "@/lib/partner-jobs/queries";

export const metadata = { title: "Edit Partner Job" };

/** Edit a partner job — details, products and files — from the studio side. */
export default async function EditAdminPartnerJobPage(
  props: PageProps<"/partner-jobs/[jobId]/edit">,
) {
  await requireAdmin();
  const { jobId } = await props.params;
  const job = await getAdminPartnerJob(jobId);
  if (!job) notFound();

  return (
    <>
      <Link
        href={`/partner-jobs/${job.id}`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm transition-colors md:min-h-9"
      >
        <ArrowLeft className="size-4" />
        Back to {job.job_number}
      </Link>

      <PageHeader
        title={`Edit ${job.job_number}`}
        description={`${job.company?.name ?? "Partner"} job. Nothing is saved until you press Save changes.`}
      />

      <NewJobForm
        jobsPath="/partner-jobs"
        actions={adminJobFormActions(job.company_id)}
        job={{
          id: job.id,
          jobName: job.job_name,
          notes: job.notes,
          items: job.items,
          files: job.files,
        }}
      />
    </>
  );
}
