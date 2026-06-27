import { AnimatedBackground } from "@/app/login/animated-background";
import { requireCustomer } from "@/lib/auth";

// Customer pages read the signed-in user's profile per request.
export const dynamic = "force-dynamic";

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Gate the whole group: only customers (not admins, not portal users) get in.
  // Defense in depth on top of the proxy and each page's own guard.
  await requireCustomer();

  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-8">
        {children}
      </div>
    </main>
  );
}
