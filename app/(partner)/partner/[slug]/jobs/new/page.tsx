import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { PageHeader } from "@/components/layout/page-header";
import { NewJobForm } from "@/components/partner-jobs/new-job-form";
import {
  partnerBasePath,
  partnerHref,
  requirePartnerSession,
} from "@/lib/partner-jobs/context";

export const metadata = { title: "New Job" };

export default async function NewPartnerJobPage({
  params,
}: PageProps<"/partner/[slug]/jobs/new">) {
  const { slug } = await params;
  await requirePartnerSession(slug, "/jobs/new");
  const basePath = await partnerBasePath(slug);

  return (
    <>
      <Link
        href={partnerHref(basePath, "/jobs")}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-9 items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeftIcon className="size-4" />
        All jobs
      </Link>

      <PageHeader
        title="New Job"
        description="Add every product this job covers, attach your files, and send it over."
      />

      {/* The form needs the external link prefix so its post-submit redirect
          keeps the rep on whichever host they signed in through. */}
      <NewJobForm basePath={basePath} />
    </>
  );
}
