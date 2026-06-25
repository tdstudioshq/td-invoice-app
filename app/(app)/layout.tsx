import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth";

// Every page in this group reads from Supabase per request, so opt out of
// static prerendering.
export const dynamic = "force-dynamic";

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: the proxy already redirects unauthenticated requests, but
  // we re-check here so Server Components/Actions never render without a user.
  // requireAdmin also bounces client-portal users to their own /portal area.
  const user = await requireAdmin();

  return <AppShell userEmail={user?.email}>{children}</AppShell>;
}
