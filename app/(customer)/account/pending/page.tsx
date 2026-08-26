import Link from "next/link";
import { redirect } from "next/navigation";
import { ClockIcon, HouseIcon, SignOutIcon } from "@phosphor-icons/react/dist/ssr";

import { HomeLogoLink } from "@/components/layout/home-logo";
import { signOutAction } from "@/app/actions/auth";
import { requireCustomer } from "@/lib/auth";

export const metadata = { title: "Account created" };

const actionClass =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-black/35 px-4 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-black/25";

/**
 * The whole customer experience between signing up and being approved.
 *
 * There is deliberately nothing to do here — no profile management, no
 * settings, no mention of what happens behind the scenes. `requireCustomer()`
 * in the layout has already established that this visitor is signed in and is
 * NOT a portal user; the moment an admin approves them, `roleHome()` and the
 * portal guards start answering `/portal` instead, and this page becomes
 * unreachable for them on the next navigation.
 */
export default async function AccountPendingPage() {
  const ctx = await requireCustomer();
  if (!ctx) {
    return (
      <p className="text-muted-foreground text-center text-sm">
        Accounts are unavailable until Supabase is configured.
      </p>
    );
  }
  // No profile yet means signup never finished — send them back to do it.
  if (!ctx.profile?.onboardedAt) redirect("/onboarding");

  return (
    <>
      <header className="text-on-photo flex flex-col items-center gap-4 text-center">
        <HomeLogoLink />
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[13px] font-medium text-amber-300 md:py-1 md:text-xs">
          <ClockIcon weight="bold" className="size-3.5" />
          Awaiting approval
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Account created
        </h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Your TD Studios client portal is waiting for approval. Once approved,
          you&apos;ll be able to access your projects, files, and invoices.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/" className={actionClass}>
          <HouseIcon weight="bold" className="size-4" />
          Return home
        </Link>
        <form action={signOutAction}>
          <button type="submit" className={`${actionClass} w-full sm:w-auto`}>
            <SignOutIcon weight="bold" className="size-4" />
            Log out
          </button>
        </form>
      </div>
    </>
  );
}
