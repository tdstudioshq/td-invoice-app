import Image from "next/image";
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
        <Image
          src="/logo.png"
          alt="TD Studios"
          width={56}
          height={56}
          priority
          className="size-14 rounded-full shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)] ring-1 ring-white/25"
        />
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
