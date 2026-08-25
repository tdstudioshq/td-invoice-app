// Every page in this group reads from Supabase per request (the signed-in rep's
// company and their jobs), so opt out of static prerendering — same reason the
// (app), (portal) and (customer) groups do.
export const dynamic = "force-dynamic";

export default function PartnerGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
