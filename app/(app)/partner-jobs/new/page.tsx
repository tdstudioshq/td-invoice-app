import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { NewJobForm } from "@/components/partner-jobs/new-job-form";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { adminJobFormActions } from "@/lib/partner-jobs/admin-form-actions";
import { getPartnerCompanies } from "@/lib/partner-jobs/queries";

export const metadata = { title: "New Partner Job" };

/**
 * File a job on a partner's behalf. The same form the rep uses, handed the
 * studio's actions for the chosen company, so the job, its products and its
 * files land exactly as a rep-filed job would — numbered from that company's
 * counter and visible in its portal.
 */
export default async function NewAdminPartnerJobPage(
  props: PageProps<"/partner-jobs/new">,
) {
  await requireAdmin();
  const { company: slug } = await props.searchParams;
  const companies = await getPartnerCompanies();
  const company =
    companies.find((c) => c.slug === slug) ??
    (companies.length === 1 ? companies[0] : undefined);

  return (
    <>
      <Link
        href="/partner-jobs"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm transition-colors md:min-h-9"
      >
        <ArrowLeft className="size-4" />
        Partner jobs
      </Link>

      {company ? (
        <>
          <PageHeader
            title={`New ${company.name} job`}
            description="Add the products, attach the files, and file it. It shows up in their portal straight away."
          />
          <NewJobForm jobsPath="/partner-jobs" actions={adminJobFormActions(company.id)} />
        </>
      ) : (
        <>
          <PageHeader title="New partner job" description="Which partner is this job for?" />
          <div className="grid grid-cols-1 gap-2 sm:max-w-sm">
            {companies.map((c) => (
              <Button key={c.id} asChild variant="outline" className="justify-start">
                <Link href={`/partner-jobs/new?company=${c.slug}`}>{c.name}</Link>
              </Button>
            ))}
            {companies.length === 0 ? (
              <p className="text-muted-foreground text-sm">No active partner companies.</p>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
