import { AnimatedBackground } from "@/app/login/animated-background";

// The builder reads the signed-in user's bio page per request.
export const dynamic = "force-dynamic";

// Standalone authenticated route (not in the (app) admin group nor the
// (customer) group) because BOTH admins and customers build bio pages here. The
// proxy already redirects anonymous users to /login?redirect=/link-builder; the
// page itself re-checks auth and routes un-onboarded customers to /onboarding.
export default function LinkBuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-8">
        {children}
      </div>
    </main>
  );
}
