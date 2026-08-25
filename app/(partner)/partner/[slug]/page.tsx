import { redirect } from "next/navigation";

import { partnerBasePath, partnerHref } from "@/lib/partner-jobs/context";

/**
 * The portal root is the jobs dashboard. Redirecting (rather than rendering the
 * dashboard at two paths) keeps one canonical URL for it, so a bookmark, a
 * revalidate and a link all mean the same page.
 */
export default async function PartnerPortalRootPage({
  params,
}: PageProps<"/partner/[slug]">) {
  const { slug } = await params;
  const basePath = await partnerBasePath(slug);
  redirect(partnerHref(basePath, "/jobs"));
}
