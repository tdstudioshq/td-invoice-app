import { HomeLogoLink } from "@/components/layout/home-logo";
import { redirect } from "next/navigation";

import { OnboardingForm } from "@/app/(customer)/onboarding/onboarding-form";
import { requireCustomer } from "@/lib/auth";

export const metadata = { title: "Set up your profile" };

export default async function OnboardingPage() {
  const ctx = await requireCustomer();
  // Already onboarded customers belong on their account page.
  if (ctx?.profile?.onboardedAt) redirect("/account");

  return (
    <>
      <header className="flex flex-col items-center gap-3 text-center">
        <HomeLogoLink />
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Set up your profile
        </h1>
        <p className="text-muted-foreground max-w-md text-sm">
          A few quick details so we can personalize your TD Studios experience.
        </p>
      </header>

      <OnboardingForm email={ctx?.user.email ?? null} />
    </>
  );
}
