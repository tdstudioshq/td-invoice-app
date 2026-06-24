import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth";

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
  const user = await requireUser();

  return <AppShell userEmail={user?.email}>{children}</AppShell>;
}
