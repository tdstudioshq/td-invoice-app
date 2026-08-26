import { notFound, redirect } from "next/navigation";

import { enterPartnerCodeAction, portalUsesKeypad } from "@/app/(partner)/partner/[slug]/access";
import { TasteBudzKeypad } from "@/app/taste-budz/keypad";
import { getPartnerContext } from "@/lib/auth";
import {
  getPartnerCompanyBySlug,
  partnerBasePath,
  partnerHref,
} from "@/lib/partner-jobs/context";

export const metadata = { title: "Enter" };

/**
 * The portal's front door: a 4-digit keypad, not a password form.
 *
 * The code unlocks a real Supabase session for the company's shared portal
 * account (see access.ts), so everything past this screen is authenticated the
 * same way it always was — this only changes what the rep has to remember.
 *
 * The keypad component is the one built for the gated galleries; the server
 * action is bound to this company's slug so one portal's code can never open
 * another's. The proxy sends an already-signed-in rep straight to /jobs, so
 * this page only renders for someone without a session.
 */
export default async function PartnerLoginPage({
  params,
  searchParams,
}: PageProps<"/partner/[slug]/login">) {
  const { slug } = await params;
  const company = await getPartnerCompanyBySlug(slug);
  if (!company || !(await portalUsesKeypad(slug))) notFound();

  const basePath = await partnerBasePath(slug);

  // Someone who already has a session has no business on the keypad — send them
  // in. The proxy does this too, but only on a fresh navigation; this covers a
  // reload after the session was created here.
  const sp = await searchParams;
  const requested = typeof sp.redirect === "string" ? sp.redirect : "";
  const next =
    requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : partnerHref(basePath, "/jobs");

  const partner = await getPartnerContext();
  if (partner && partner.companySlug === slug) redirect(next);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col justify-center py-10 sm:py-16">
      <div className="mb-10 space-y-1.5 text-center">
        <h1 className="text-metal-platinum text-xl font-semibold tracking-tight">
          {company.name} Orders
        </h1>
        <p className="text-muted-foreground text-sm">
          Enter your code to submit and track design jobs.
        </p>
      </div>

      <TasteBudzKeypad
        logoUrl="/logo.png"
        logoAlt={`${company.name} Orders`}
        logoClassName="size-16"
        hint="Enter the code to come inside."
        action={enterPartnerCodeAction}
        extraFields={{ slug, next }}
      />

      <p className="text-muted-foreground mt-10 text-center text-sm md:text-xs">
        Don&apos;t have the code? Text TD Studios.
      </p>
    </div>
  );
}
