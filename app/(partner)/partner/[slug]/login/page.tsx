import { notFound } from "next/navigation";

import { PartnerLoginForm } from "@/components/partner-jobs/partner-login-form";
import {
  getPartnerCompanyBySlug,
  partnerBasePath,
} from "@/lib/partner-jobs/context";

export const metadata = { title: "Sign in" };

/**
 * The portal's own sign-in. Separate from the public /login card on purpose:
 * this door is addressed by the partner's hostname, shows their name, and offers
 * no self-signup or Google path — a partner account is provisioned by TD
 * Studios, never claimed.
 *
 * The proxy sends a signed-in rep straight to /jobs, so this page only ever
 * renders for a visitor without a session.
 */
export default async function PartnerLoginPage({
  params,
  searchParams,
}: PageProps<"/partner/[slug]/login">) {
  const { slug } = await params;
  const company = await getPartnerCompanyBySlug(slug);
  if (!company) notFound();

  const sp = await searchParams;
  const redirectTo = typeof sp.redirect === "string" ? sp.redirect : undefined;
  const basePath = await partnerBasePath(slug);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col justify-center py-8 sm:py-16">
      <div className="mb-7 space-y-1.5 text-center">
        <h1 className="text-metal-platinum text-xl font-semibold tracking-tight">
          {company.name} Orders
        </h1>
        <p className="text-muted-foreground text-sm">
          Sign in to submit and track design jobs.
        </p>
      </div>

      <PartnerLoginForm
        slug={slug}
        basePath={basePath}
        redirectTo={redirectTo}
      />

      <p className="text-muted-foreground mt-6 text-center text-xs">
        Need access? Ask TD Studios to set up your login.
      </p>
    </div>
  );
}
