import { MustChangePasswordBanner } from "@/components/portal/must-change-password-banner";
import { PortalShell } from "@/components/portal/portal-shell";
import { requirePortalUser } from "@/lib/auth";
import { getClient } from "@/lib/data";

// Every portal page reads the signed-in client's data per request.
export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Enforces a client-portal session and bounces admins to /dashboard.
  const portal = await requirePortalUser();
  const client = portal ? await getClient(portal.clientId) : null;

  return (
    <PortalShell
      companyName={client?.company_name}
      userEmail={portal?.email}
    >
      {portal?.mustChangePassword ? <MustChangePasswordBanner /> : null}
      {children}
    </PortalShell>
  );
}
