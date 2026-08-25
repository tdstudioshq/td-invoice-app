import { notFound } from "next/navigation";

import { PartnerShell } from "@/components/partner-jobs/partner-shell";
import { getPartnerContext } from "@/lib/auth";
import {
  getPartnerCompanyBySlug,
  partnerBasePath,
} from "@/lib/partner-jobs/context";

/**
 * Frame for one print-partner portal.
 *
 * Deliberately does NOT enforce a session: the login page lives under here too,
 * and a layout-level `requirePartnerSession()` would make it unreachable. Each
 * page gates itself instead (see requirePartnerSession), which is also where the
 * real boundary is — RLS — so the layout only decides which chrome to draw.
 *
 * An unknown or deactivated slug 404s here, once, for every page beneath it.
 */
export default async function PartnerPortalLayout({
  children,
  params,
}: LayoutProps<"/partner/[slug]">) {
  const { slug } = await params;

  const company = await getPartnerCompanyBySlug(slug);
  if (!company) notFound();

  const partner = await getPartnerContext();
  const signedIn = Boolean(partner && partner.companySlug === slug);
  const basePath = await partnerBasePath(slug);

  return (
    <PartnerShell
      companyName={company.name}
      basePath={basePath}
      userEmail={signedIn ? partner?.email : null}
      signedIn={signedIn}
    >
      {children}
    </PartnerShell>
  );
}
