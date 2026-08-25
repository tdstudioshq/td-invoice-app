import { HomeLogoLink } from "@/components/layout/home-logo";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/(customer)/onboarding/onboarding-form";
import { requireCustomer } from "@/lib/auth";

export const metadata = { title: "Finish your account" };

// Reached only when signup could not write the profile itself — i.e. Supabase
// email confirmation is ON, so no session existed at signup time. The two
// fields were already typed on /sign-up and ride back in user metadata, so this
// is a confirm-and-continue step, not a separate onboarding flow.
export default async function OnboardingPage() {
  const ctx = await requireCustomer();
  // A finished profile means there is nothing to do here — the only thing left
  // is approval.
  if (ctx?.profile?.onboardedAt) redirect("/account/pending");

  const meta = (ctx?.user.user_metadata ?? {}) as Record<string, unknown>;
  const metaString = (key: string) =>
    typeof meta[key] === "string" ? (meta[key] as string) : undefined;

  return (
    <>
      <header className="text-on-photo flex flex-col items-center gap-3 text-center">
        <HomeLogoLink />
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Finish your account
        </h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Confirm these details and your portal request goes straight to us.
        </p>
      </header>

      <OnboardingForm
        email={ctx?.user.email ?? null}
        defaultFullName={metaString("full_name") ?? ctx?.profile?.fullName ?? undefined}
        defaultBusinessName={
          metaString("business_name") ?? ctx?.profile?.businessName ?? undefined
        }
      />
    </>
  );
}
