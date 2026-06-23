import { AppShell } from "@/components/layout/app-shell";

// Every page in this group reads from Supabase per request, so opt out of
// static prerendering.
export const dynamic = "force-dynamic";

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
