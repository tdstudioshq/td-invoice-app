import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { PageHeader } from "@/components/layout/page-header";
import { NewJobForm } from "@/components/partner-jobs/new-job-form";
import {
  partnerBasePath,
  partnerHref,
  requirePartnerSession,
} from "@/lib/partner-jobs/context";
import { getPartnerJob } from "@/lib/partner-jobs/queries";

export const metadata = { title: "Edit Job" };

/**
 * Edit a filed job — details, products and files.
 *
 * The same form that files a new job, handed the existing values. RLS scopes
 * the read, so a job id belonging to another company resolves to null and 404s
 * here rather than opening somebody else's work.
 *
 * Status is deliberately absent: it is the studio's field, and the database
 * forces it back for any rep-side write, so there is nothing to show here.
 */
export default async function EditPartnerJobPage({
  params,
}: PageProps<"/partner/[slug]/jobs/[jobId]/edit">) {
  const { slug, jobId } = await params;
  await requirePartnerSession(slug, `/jobs/${jobId}/edit`);
  const basePath = await partnerBasePath(slug);

  const job = await getPartnerJob(jobId);
  if (!job) notFound();

  return (
    <>
      <Link
        href={partnerHref(basePath, `/jobs/${jobId}`)}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeftIcon className="size-4" />
        Back to {job.job_number}
      </Link>

      <PageHeader
        title={`Edit ${job.job_number}`}
        description="Change the details, products or files. Nothing is saved until you press Save changes."
      />

      <NewJobForm
        basePath={basePath}
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
