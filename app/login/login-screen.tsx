import { redirect } from "next/navigation";

import { AnimatedBackground } from "@/app/login/animated-background";
import { LoginPanel } from "@/app/login/login-panel";
import { getPortalContext, getUser } from "@/lib/auth";

/**
 * The shared TD Studios sign-in screen, rendered by both `/` and `/login`.
 * Already-signed-in users are sent to the right home for their role (portal
 * users to /portal, admins to /dashboard) instead of seeing the form.
 */
export async function AuthScreen({
  redirectTo,
  justReset,
}: {
  redirectTo?: string;
  justReset?: boolean;
}) {
  if (await getUser()) {
    redirect((await getPortalContext()) ? "/portal" : "/dashboard");
  }

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 w-full max-w-sm">
        <LoginPanel redirectTo={redirectTo} justReset={justReset} />
      </div>
    </main>
  );
}
